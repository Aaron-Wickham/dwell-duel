import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('the tabs split markets into open, waiting and resolved, Open by default, and the choice lives in the URL', async ({ page }) => {
  const title = `Filter check ${Date.now()}`
  const close = new Date(Date.now() + 2 * 60 * 60 * 1000)
  close.setSeconds(0, 0)
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(close))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)

  await page.goto('/markets')
  const filters = page.getByRole('navigation', { name: 'Filter markets' })
  await expect(filters.getByRole('link')).toHaveText(['Open', 'Waiting', 'Resolved'])
  await expect(filters.getByRole('link', { name: 'Open' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await filters.getByRole('link', { name: 'Waiting' }).click()
  await expect(page).toHaveURL(/status=awaiting$/)
  await expect(filters.getByRole('link', { name: 'Waiting' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)

  await filters.getByRole('link', { name: 'Resolved' }).click()
  await expect(page).toHaveURL(/status=resolved$/)
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)

  await page.reload()
  await expect(filters.getByRole('link', { name: 'Resolved' })).toHaveAttribute('aria-current', 'page')

  await filters.getByRole('link', { name: 'Open' }).click()
  await expect(page).toHaveURL(/\/markets$/)
  await expect(page.getByRole('link', { name: title })).toBeVisible()
})

test('links to the old Pending, Closed and All tabs land on Waiting, Resolved and Open', async ({ page }) => {
  const filters = page.getByRole('navigation', { name: 'Filter markets' })

  await page.goto('/markets?status=pending')
  await expect(filters.getByRole('link', { name: 'Waiting' })).toHaveAttribute('aria-current', 'page')

  await page.goto('/markets?status=closed')
  await expect(filters.getByRole('link', { name: 'Resolved' })).toHaveAttribute('aria-current', 'page')

  await page.goto('/markets?status=all')
  await expect(filters.getByRole('link', { name: 'Open' })).toHaveAttribute('aria-current', 'page')
})
