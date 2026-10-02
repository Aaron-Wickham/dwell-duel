import { test, expect } from '@playwright/test'
import { serviceClient } from '../tests/db/helpers'
import { localDateTimeString } from './local-date-time'

// #261: with more markets waiting on a result than fit on a page, the All tab still opens on the
// markets taking bets, and each side has its own Show more.
test('the All tab lists open markets first however many are awaiting resolution', async ({ page }) => {
  const title = `Open first ${Date.now()}`
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 2 * 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)
  const marketId = page.url().split('/').pop()!

  const { data: market, error: readErr } = await serviceClient().from('markets').select('created_by').eq('id', marketId).single()
  if (readErr) throw readErr
  const tag = `Awaiting filler ${Date.now()}`
  const start = Date.now() - 3 * 86_400_000
  const { data: fillers, error } = await serviceClient()
    .from('markets')
    .insert(
      Array.from({ length: 55 }, (_, i) => ({
        created_by: market.created_by,
        title: `${tag} ${i}`,
        kind: 'binary' as const,
        status: 'open' as const,
        close_at: new Date(start + i * 60_000).toISOString(),
      })),
    )
    .select('id')
  if (error) throw error

  try {
    await page.goto('/markets')
    const headings = page.getByRole('heading', { level: 2 })
    await expect(headings.first()).toHaveText('Open')
    const open = page.getByRole('region', { name: 'Open', exact: true })
    await expect(open.getByRole('link', { name: title, exact: true })).toBeVisible()

    const awaiting = page.getByRole('region', { name: 'Awaiting resolution' })
    // The fillers closed days before anything else, so they lead the awaiting list.
    await expect(awaiting.getByRole('link', { name: new RegExp(`^${tag} `) })).toHaveCount(50)
    const awaitingMore = page.locator('a[href*="awaiting="]', { hasText: 'Show more' })
    await expect(awaitingMore).toBeVisible()
    await awaitingMore.click()
    await expect(awaiting.getByRole('link', { name: new RegExp(`^${tag} `) })).toHaveCount(55)
    await expect(page.getByRole('region', { name: 'Open', exact: true }).getByRole('link', { name: title, exact: true })).toBeVisible()
  } finally {
    await serviceClient()
      .from('markets')
      .delete()
      .in(
        'id',
        fillers.map((f) => f.id),
      )
  }
})
