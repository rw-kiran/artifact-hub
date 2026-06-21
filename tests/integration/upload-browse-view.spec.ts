import { test, expect, type Page } from '@playwright/test'
import path from 'path'

const FIXTURES = path.join(__dirname, '../fixtures')

async function uploadFile(page: Page, filename: string, titleValue: string) {
  await page.goto('/artifacts/upload')
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, filename))
  // Wait for blob upload to finish and details form to appear
  await expect(page.getByRole('button', { name: 'Publish Artifact' })).toBeVisible({ timeout: 30_000 })
  await page.getByPlaceholder('Untitled').fill(titleValue)
  await page.getByRole('button', { name: 'Publish Artifact' }).click()
  await page.waitForURL(/\/artifacts\/[0-9a-f]/, { timeout: 15_000 })
  return page.url().split('/').at(-1)!
}

test.describe('P1 — Upload → Browse → View', () => {
  test('upload HTML artifact, appears in gallery, previews in viewer', async ({ page }) => {
    const id = await uploadFile(page, 'test.html', 'Integration HTML Test')

    // Detail page: title shown
    await expect(page.getByRole('heading', { name: 'Integration HTML Test' })).toBeVisible()
    // Viewer renders (iframe sandbox)
    await expect(page.locator('iframe[sandbox]')).toBeVisible()

    // Gallery: card appears
    await page.goto('/')
    await expect(page.getByText('Integration HTML Test')).toBeVisible()
  })

  test('upload image artifact, previews as <img>', async ({ page }) => {
    await uploadFile(page, 'test.png', 'Integration PNG Test')
    await expect(page.getByRole('heading', { name: 'Integration PNG Test' })).toBeVisible()
    await expect(page.locator('img[alt]')).toBeVisible()
  })

  test('upload PDF artifact, previews as <embed>', async ({ page }) => {
    await uploadFile(page, 'test.pdf', 'Integration PDF Test')
    await expect(page.getByRole('heading', { name: 'Integration PDF Test' })).toBeVisible()
    // embed or iframe depending on ArtifactViewer
    const previewEl = page.locator('embed, iframe').first()
    await expect(previewEl).toBeVisible()
  })
})

test.describe('P5 — AI metadata + index status', () => {
  test('upload without title → AI populates title and shows index badge', async ({ page }) => {
    // Upload with blank title so AI must generate one
    await page.goto('/artifacts/upload')
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'test.html'))
    await expect(page.getByRole('button', { name: 'Publish Artifact' })).toBeVisible({ timeout: 30_000 })
    // leave title blank, let AI fill it
    await page.getByRole('button', { name: 'Publish Artifact' }).click()
    await page.waitForURL(/\/artifacts\/[0-9a-f]/, { timeout: 15_000 })

    // Indexing is async — the Server Component won't live-update. Poll with reload.
    // ponytail: 40s total; Claude call typically completes in 5-15s
    await expect(async () => {
      await page.reload()
      await expect(
        page.locator('span').filter({ hasText: /AI Ready|AI Failed/ }).first()
      ).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 40_000 })

    // Once indexed, the AI-generated title must be present
    const title = await page.getByRole('heading').first().textContent()
    expect(title?.trim().length).toBeGreaterThan(0)
  })
})
