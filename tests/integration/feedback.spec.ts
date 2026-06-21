import { test, expect, type Page } from '@playwright/test'
import path from 'path'

const FIXTURES = path.join(__dirname, '../fixtures')

async function createArtifact(page: Page) {
  await page.goto('/artifacts/upload')
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'test.html'))
  await expect(page.getByRole('button', { name: 'Publish Artifact' })).toBeVisible({ timeout: 30_000 })
  await page.getByPlaceholder('Untitled').fill('Feedback Flow Test')
  await page.getByRole('button', { name: 'Publish Artifact' }).click()
  await page.waitForURL(/\/artifacts\/[0-9a-f]/, { timeout: 15_000 })
}

async function postComment(page: Page, text: string, stars?: number) {
  if (stars) {
    await page.getByRole('button', { name: `Rate ${stars} star` }).click()
  }
  await page.getByPlaceholder(/Write your feedback/).fill(text)
  await page.getByRole('button', { name: 'Post comment' }).click()
  // After submit, content is cleared so the button stays disabled (content.length < 10).
  // Wait for the comment text to appear in the list instead — confirms the request completed.
  await expect(page.getByText(text).last()).toBeVisible({ timeout: 10_000 })
}

test.describe('P3 — Feedback', () => {
  test('submit 3 comments with ratings, all appear in chronological order', async ({ page }) => {
    await createArtifact(page)

    const comments = [
      { text: 'First comment: looks great overall.', stars: 4 },
      { text: 'Second comment: the layout could be improved.', stars: 3 },
      { text: 'Third comment: really well structured content.', stars: 5 },
    ]

    for (const c of comments) {
      await postComment(page, c.text, c.stars)
    }

    // Chronological order: first comment appears before second
    const cards = page.locator('.border.border-gray-100.rounded-lg.p-4')
    const texts = await cards.allTextContents()
    const firstIdx = texts.findIndex(t => t.includes('First comment'))
    const secondIdx = texts.findIndex(t => t.includes('Second comment'))
    const thirdIdx = texts.findIndex(t => t.includes('Third comment'))
    expect(firstIdx).toBeLessThan(secondIdx)
    expect(secondIdx).toBeLessThan(thirdIdx)

    // Stars rendered for rated comments
    await expect(page.getByText('★★★★☆').first()).toBeVisible()
  })
})

test.describe('P5 — Feedback AI summary', () => {
  test('3+ comments trigger an AI summary card', async ({ page }) => {
    await createArtifact(page)

    const comments = [
      'This artifact is very informative and well organized.',
      'I found some minor issues with the formatting sections.',
      'Overall a great piece of work with excellent detail.',
    ]
    for (const text of comments) {
      await postComment(page, text)
    }

    // AI summary is written async after feedback insert — poll by reloading until it appears
    // ponytail: 40s total; Claude call + DB write takes ~5-15s after the last comment
    await expect(async () => {
      await page.reload()
      await expect(page.getByText('AI Summary')).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 40_000 })

    const summaryCard = page.locator('div').filter({ hasText: 'AI Summary' }).first()
    const summaryText = await summaryCard.locator('p').last().textContent()
    expect(summaryText?.trim().length).toBeGreaterThan(20)
  })
})
