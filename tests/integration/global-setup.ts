import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

export default async function globalSetup() {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env.local')
  }
  if (!supabaseUrl || !serviceRole) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  }

  // Ensure the test user exists — idempotent, safe to run on every test run
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email confirmation for test user
  })
  if (createError && !createError.message.toLowerCase().includes('already been registered')) {
    throw new Error(`Could not create test user: ${createError.message}`)
  }

  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
  const authDir = path.join(__dirname, '.auth')
  fs.mkdirSync(authDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto(`${baseURL}/auth/signin`)
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  try {
    await page.waitForURL(`${baseURL}/`, { timeout: 15_000 })
  } catch {
    const errMsg = await page.locator('.text-red-500').first().textContent().catch(() => null)
    await browser.close()
    throw new Error(
      `Sign-in redirect timed out.${errMsg ? ` Supabase said: "${errMsg.trim()}"` : ''} ` +
      `Check that Email auth is enabled in Supabase → Authentication → Providers.`
    )
  }

  await page.context().storageState({ path: path.join(authDir, 'user.json') })
  await browser.close()
}
