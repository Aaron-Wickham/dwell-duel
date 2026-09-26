import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('Add to parlay flips the row and the nav count before the server answers', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the optimistic pick land?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  // An outcome needs a pool before it can join a slip.
  await page.getByRole('combobox').first().selectOption({ label: 'Yes' })
  await page.getByPlaceholder('Amount (DC)').fill('1')
  await page.getByRole('button', { name: 'Place bet' }).click()
  await expect(page.getByRole('region', { name: 'Bets' }).getByText('1 DC on Yes')).toBeVisible()

  // Hold the add request until the optimistic state has been checked, so the check can't race
  // the server. A server action is a POST to the page's own URL with a Next-Action header.
  const marketPath = new URL(page.url()).pathname
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let intercepted = false
  await page.route(
    (url) => url.pathname === marketPath,
    async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        intercepted = true
        await held
      }
      await route.continue()
    },
  )

  const outcomes = page.getByRole('region', { name: 'Outcomes' })
  const yesRow = outcomes.getByRole('listitem').filter({ hasText: 'Yes' })
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav.getByRole('link', { name: 'Parlays', exact: true })).toBeVisible()

  await yesRow.getByRole('button', { name: 'Add to parlay' }).click()

  await expect(yesRow.getByText('In your slip')).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Parlays (1)', exact: true })).toBeVisible()
  await expect.poll(() => intercepted).toBe(true)
  await expect(page.getByText('Added to your slip.')).toHaveCount(0)

  // Record whether the row ever flashes back to "Add to parlay" while the server state lands.
  await yesRow.evaluate((row) => {
    const flags = window as unknown as { flashedBack: boolean }
    flags.flashedBack = false
    new MutationObserver(() => {
      if (row.textContent?.includes('Add to parlay')) flags.flashedBack = true
    }).observe(row, { childList: true, subtree: true, characterData: true })
  })
  release()

  await expect(page.getByText('Added to your slip.')).toBeVisible()
  await expect(outcomes.getByText('In your slip')).toHaveCount(1)
  await expect(nav.getByRole('link', { name: 'Parlays (1)', exact: true })).toBeVisible()
  // The phone slip drawer's trigger only mounts once the server's own slip has a pick (it
  // renders nothing before that), so its mere presence -- not its label, which follows the same
  // optimistic badge as the nav -- proves the server's props have actually landed. `getByText`,
  // not `getByRole`, because the trigger is `md:hidden` at this viewport and role queries drop
  // display:none elements from the accessibility tree.
  await expect(page.getByText(/^Slip \(/)).toBeAttached()
  expect(await page.evaluate(() => (window as unknown as { flashedBack: boolean }).flashedBack)).toBe(false)
  await page.unrouteAll()
})
