import { test, expect } from '@playwright/test'
import { serviceClient } from '../tests/db/helpers'

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the top bar reaches every destination and marks the current one', async ({ page }) => {
    await page.goto('/markets')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Markets', 'My bets', 'Tasks', 'Feed', 'Leaderboard', 'Admin']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(nav.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Markets', exact: true })).toHaveAttribute('aria-current', 'page')

    await page.getByRole('banner').getByRole('link', { name: 'DwellDuel home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('banner').getByRole('link', { name: 'DwellDuel home' })).toHaveAttribute('aria-current', 'page')
  })

  test('the balance opens My bets and the avatar opens your profile', async ({ page }) => {
    await page.goto('/markets')
    const banner = page.getByRole('banner')
    await banner.getByRole('link', { name: /^Balance \d+ DC, view my bets$/ }).click()
    await expect(page).toHaveURL(/\/bets$/)

    await banner.getByRole('link', { name: 'Your profile' }).click()
    await expect(page).toHaveURL(/\/members\/[0-9a-f-]+$/)
    await expect(banner.getByRole('link', { name: 'Your profile' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the tab bar and top bar reach every destination', async ({ page }) => {
    await page.goto('/')
    const tabs = page.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Markets', 'My bets', 'Tasks', 'Feed', 'Leaders, leaderboard']) {
      await expect(tabs.getByRole('link', { name, exact: true })).toBeVisible()
    }
    const banner = page.getByRole('banner')
    await expect(banner.getByRole('link', { name: 'Admin', exact: true })).toBeVisible()
    await expect(banner.getByRole('link', { name: 'Your profile' })).toBeVisible()

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
      await page.goto('/')
      await expect(page.getByRole('banner').getByText('Balance 99999 DC, view my bets')).toBeAttached()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBe(0)
    } finally {
      await db.from('profiles').update({ balance: admin!.balance }).eq('id', admin!.id)
    }
  })
})
