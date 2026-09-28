import { test, expect } from '@playwright/test'

test('the theme can be set to dark, survives a reload, and goes back to following the device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/settings')
  const html = page.locator('html')
  await expect(page.getByLabel('System')).toBeChecked()
  await expect(html).not.toHaveAttribute('data-theme', /./)

  await page.getByLabel('Dark').check()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'theme')?.value).toBe('dark')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByLabel('Dark')).toBeChecked()

  await page.getByLabel('System').check()
  await expect(html).not.toHaveAttribute('data-theme', /./)
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'theme')).toBeUndefined()
})

test('haptics and reduced motion are saved as cookies and put on the page before any script runs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/settings')
  const html = page.locator('html')

  await page.getByLabel('Vibrate on taps').uncheck()
  await expect(html).toHaveAttribute('data-haptics', 'off')
  await page.getByLabel('Reduce animations').check()
  await expect(html).toHaveAttribute('data-motion', 'reduce')
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'motion')?.value).toBe('reduce')

  const response = await page.request.get('/settings')
  const markup = await response.text()
  expect(markup).toMatch(/<html[^>]*data-haptics="off"/)
  expect(markup).toMatch(/<html[^>]*data-motion="reduce"/)

  await page.reload()
  await page.getByLabel('Vibrate on taps').check()
  await page.getByLabel('Reduce animations').uncheck()
  await expect(html).not.toHaveAttribute('data-haptics', /./)
  await expect(html).not.toHaveAttribute('data-motion', /./)
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'motion')).toBeUndefined()
})

test('Settings is reached from your own profile', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'Your profile' }).first().click()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})
