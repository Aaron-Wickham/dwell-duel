import { test, expect } from '@playwright/test'
import { serviceClient } from '../tests/db/helpers'

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the top bar reaches every destination and marks the current one', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Home', 'Markets', 'Parlays', 'Tasks', 'Feed', 'Leaderboard', 'Admin']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('banner').getByText(/^Balance \d+ DC$/)).toBeVisible()

    await nav.getByRole('link', { name: 'Markets', exact: true }).click()
    await expect(page).toHaveURL(/\/markets$/)
    await expect(nav.getByRole('link', { name: 'Markets', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the tab bar and top bar reach every destination', async ({ page }) => {
    await page.goto('/')
    const tabs = page.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Home', 'Markets', 'Parlays', 'Tasks', 'Feed', 'Leaderboard']) {
      await expect(tabs.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true })).toBeVisible()

    await tabs.getByRole('link', { name: 'Leaderboard', exact: true }).click()
    await expect(page).toHaveURL(/\/leaderboard$/)
    await expect(tabs.getByRole('link', { name: 'Leaderboard', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})

test('the theme toggle switches the theme and remembers it after a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-theme', /./)

  await page.getByRole('banner').getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect
    .poll(async () => (await page.context().cookies()).find((c) => c.name === 'theme')?.value)
    .toBe('dark')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Switch to light theme' })).toBeVisible()
})

test.describe('phone top bar', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('fits at 375px with a five-digit balance', async ({ page }) => {
    const db = serviceClient()
    const { data: admin, error } = await db.from('profiles').select('id, balance').eq('role', 'owner').single()
    expect(error).toBeNull()
    try {
      await db.from('profiles').update({ balance: 99999 }).eq('id', admin!.id)
      await page.goto('/')
      await expect(page.getByRole('banner').getByText('Balance 99999 DC')).toBeAttached()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBe(0)
    } finally {
      await db.from('profiles').update({ balance: admin!.balance }).eq('id', admin!.id)
    }
  })
})
