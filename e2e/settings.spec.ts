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

test('Settings is reached from the avatar menu', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('banner').getByRole('button', { name: /^Your profile and settings/ }).first().click()
  await page.getByRole('menu').getByRole('menuitem', { name: /Settings/ }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

// Saving the choices is covered by tests/components/notification-settings.test.tsx: they can only
// be changed where notifications can work, and this server has no VAPID keys (#398).
test('the Notifications card shows your choices, disabled with a reason where push can’t work', async ({ page }) => {
  await page.goto('/settings')
  // exact, since sonner's toast region is labelled "Notifications alt+T".
  const card = page.getByRole('region', { name: 'Notifications', exact: true })
  await expect(card).toBeVisible()
  // Playwright's server runs without the VAPID keys, so this device can't subscribe here.
  await expect(card.getByText(/Notifications aren’t available here/)).toBeVisible()
  await expect(card.getByText('You can choose these on a device that can get notifications.')).toBeVisible()

  const newMarkets = card.getByRole('checkbox', { name: 'New markets' })
  const results = card.getByRole('checkbox', { name: 'Results' })
  await expect(newMarkets).not.toBeChecked()
  await expect(newMarkets).toBeDisabled()
  await expect(results).toBeChecked()
  await expect(card.getByRole('button', { name: 'Save choices' })).toHaveAttribute('aria-disabled', 'true')
})

test('Settings says which cards apply to this device and which to your account (#398)', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('region', { name: 'Appearance & motion' })).toContainText('On this device.')
  await expect(page.getByRole('region', { name: 'Account' })).toContainText('every device you sign in on')
  await expect(page.getByText('These apply on this device.')).toHaveCount(0)
})

test('Settings links to How it works and to its Your data section (#286)', async ({ page }) => {
  await page.goto('/settings')
  const help = page.getByRole('region', { name: 'Help' })
  await expect(help.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/how-it-works')
  await help.getByRole('link', { name: 'Your data' }).click()
  await expect(page).toHaveURL(/\/how-it-works\/rules#how-your-data$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeInViewport()
})
