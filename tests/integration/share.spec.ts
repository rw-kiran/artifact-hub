import { test, expect, type Page } from '@playwright/test'
import path from 'path'

const FIXTURES = path.join(__dirname, '../fixtures')

async function createArtifact(page: Page) {
  await page.goto('/artifacts/upload')
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'test.html'))
  await expect(page.getByRole('button', { name: 'Publish Artifact' })).toBeVisible({ timeout: 30_000 })
  await page.getByPlaceholder('Untitled').fill('Share Flow Test')
  await page.getByRole('button', { name: 'Publish Artifact' }).click()
  await page.waitForURL(/\/artifacts\/[0-9a-f]/, { timeout: 15_000 })
}

test.describe('P2 — Share', () => {
  test('owner generates share link, unauthenticated user can view via it', async ({ page, browser }) => {
    await createArtifact(page)
    await expect(page.getByRole('heading', { name: 'Share Flow Test' })).toBeVisible()

    // Open share modal
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByRole('dialog', { name: 'Share artifact' })).toBeVisible()

    // Generate link with 1-hour expiry
    await page.getByLabel('Expires in (hours)').fill('1')
    await page.getByRole('button', { name: 'Generate link' }).click()
    await expect(page.locator('input[aria-label="Share URL"]')).toBeVisible({ timeout: 10_000 })

    const shareUrl = await page.locator('input[aria-label="Share URL"]').inputValue()
    expect(shareUrl).toMatch(/\/share\/[a-f0-9]+/)

    // Open share URL in a fresh context with no auth cookies
    const anonCtx = await browser.newContext()
    const anonPage = await anonCtx.newPage()
    await anonPage.goto(shareUrl)

    // SSR page may take a moment to render — use generous timeout
    await expect(anonPage.getByRole('heading', { name: 'Share Flow Test' })).toBeVisible({ timeout: 15_000 })
    await expect(anonPage.getByText(/expires in \d+h/i)).toBeVisible()
    // No feedback panel on share view
    await expect(anonPage.getByRole('heading', { name: 'Feedback' })).not.toBeVisible()

    await anonCtx.close()
  })

  test('active share links listed in modal, can be revoked', async ({ page }) => {
    await createArtifact(page)
    await page.getByRole('button', { name: 'Share' }).click()
    await page.getByLabel('Expires in (hours)').fill('2')
    await page.getByRole('button', { name: 'Generate link' }).click()
    await expect(page.locator('input[aria-label="Share URL"]')).toBeVisible({ timeout: 10_000 })

    // "Active links" section should appear with at least one entry
    await expect(page.getByText('Active links', { exact: false })).toBeVisible()

    // Revoke the link
    await page.getByRole('button', { name: 'Revoke' }).first().click()
    // After revoke, generatedUrl state becomes '' → the input is conditionally removed from DOM
    await expect(page.locator('input[aria-label="Share URL"]')).not.toBeVisible({ timeout: 10_000 })
  })
})
