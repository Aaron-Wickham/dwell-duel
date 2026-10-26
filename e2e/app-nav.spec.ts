import { test, expect } from '@playwright/test'
import { serviceClient } from '../tests/db/helpers'

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the top bar reaches every destination and marks the current one', async ({ page }) => {
    await page.goto('/markets')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    // Named as the tab bar's are, so voice control can say "Leaders" below xl or "Leaderboard" from it.
    for (const name of ['Home', 'Markets', 'My bets', 'Tasks', 'Leaders, leaderboard']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
    // D1 (#385): the feed is Home's Activity, and Admin opens from the avatar menu.
    await expect(nav.getByRole('link', { name: 'Feed', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Markets', exact: true })).toHaveAttribute('aria-current', 'page')

    await page.getByRole('banner').getByRole('link', { name: 'DwellDuel home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(nav.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('the balance opens My bets and the avatar menu opens your profile, Settings and Admin', async ({ page }) => {
    await page.goto('/markets')
    const banner = page.getByRole('banner')
    await banner.getByRole('link', { name: /^Balance [\d,]+\sDC, view my bets$/ }).click()
    await expect(page).toHaveURL(/\/bets$/)

    await banner.getByRole('button', { name: /^Your profile and settings/ }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /Settings/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Admin/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Send feedback/ })).toHaveAttribute('href', /^mailto:/)
    await menu.getByRole('menuitem', { name: /Your profile/ }).click()
    await expect(page).toHaveURL(/\/members\/[0-9a-f-]+$/)
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the tab bar and top bar reach every destination', async ({ page }) => {
    await page.goto('/')
    const tabs = page.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Home', 'Markets', 'My bets', 'Tasks', 'Leaders, leaderboard']) {
      await expect(tabs.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(tabs.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
    const banner = page.getByRole('banner')
    // The top bar holds the wordmark, the balance and the avatar, for every role (#385).
    await expect(banner.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await expect(banner.getByRole('button', { name: /^Your profile and settings/ })).toBeVisible()
    // Home's Balance card shows the balance, so the top bar leaves it out there (D-6).
    await expect(banner.getByRole('link', { name: /^Balance/ })).toHaveCount(0)

    await tabs.getByRole('link', { name: 'Leaders, leaderboard', exact: true }).click()
    await expect(page).toHaveURL(/\/leaderboard$/)
    await expect(tabs.getByRole('link', { name: 'Leaders, leaderboard', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('phone top bar', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('fits at 375px with a five-digit balance', async ({ page }) => {
    const db = serviceClient()
    const { data: admin, error } = await db.from('profiles').select('id, balance').eq('role', 'owner').single()
    expect(error).toBeNull()
    try {
      await db.from('profiles').update({ balance: 99999 }).eq('id', admin!.id)
      // Home leaves the chip out (D-6), so this measures a page that has it.
      await page.goto('/markets')
      await expect(page.getByRole('banner').getByText(/^Balance 99,999\sDC, view my bets$/)).toBeAttached()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBe(0)
    } finally {
      await db.from('profiles').update({ balance: admin!.balance }).eq('id', admin!.id)
    }
  })
})
