import { test, expect } from '@playwright/test'
import { serviceClient } from '../tests/db/helpers'
import { localDateTimeString } from './local-date-time'

// The markets share of the Admin badge has a tab of its own (#243).
test('Admin › Markets lists a closed market with no result and opens its resolve form', async ({ page }) => {
  const title = `Awaiting check ${Date.now()}`
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 2 * 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)
  const marketId = page.url().split('/').pop()!

  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', marketId)
  if (error) throw error

  await page.goto('/admin/markets')
  const tabs = page.getByRole('navigation', { name: 'Admin sections' })
  await expect(tabs.getByRole('link', { name: /^Markets \(\d+\)$/ })).toHaveAttribute('aria-current', 'page')
  const list = page.getByRole('region', { name: 'Waiting to be resolved' })
  await expect(list.getByRole('link', { name: title, exact: true })).toBeVisible()

  await list.getByRole('link', { name: `Resolve ${title}` }).click()
  await expect(page).toHaveURL(new RegExp(`/markets/${marketId}#manage-title$`))
  await expect(page.getByRole('heading', { name: 'Resolve market' })).toBeVisible()
})
