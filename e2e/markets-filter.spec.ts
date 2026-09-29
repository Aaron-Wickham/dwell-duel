import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('the filters split markets into open, pending resolution and closed, and the choice lives in the URL', async ({ page }) => {
  const title = `Filter check ${Date.now()}`
  const close = new Date(Date.now() + 2 * 60 * 60 * 1000)
  close.setSeconds(0, 0)
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Close time').fill(localDateTimeString(close))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)

  await page.goto('/markets')
  const filters = page.getByRole('navigation', { name: 'Filter markets' })
  await expect(filters.getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await filters.getByRole('link', { name: 'Open' }).click()
  await expect(page).toHaveURL(/\/markets\?status=open$/)
  await expect(filters.getByRole('link', { name: 'Open' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  await filters.getByRole('link', { name: 'Pending' }).click()
  await expect(page).toHaveURL(/status=pending$/)
  await expect(filters.getByRole('link', { name: 'Pending' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)

  await filters.getByRole('link', { name: 'Closed' }).click()
  await expect(page).toHaveURL(/status=closed$/)
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)

  await page.reload()
  await expect(filters.getByRole('link', { name: 'Closed' })).toHaveAttribute('aria-current', 'page')
})
