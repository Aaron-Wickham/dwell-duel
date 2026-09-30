import { test, expect, request as apiRequest } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { serviceClient } from '../tests/db/helpers'

// #258: the create commits, but its answer never reaches the phone, and Next replays the action.
// The replay carries the same attempt key, so it returns the first market instead of making a second.
test('a create-market whose response is lost does not make a second market', async ({ page }) => {
  test.setTimeout(60_000)
  const title = `Lost create ${Date.now()}`
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))

  // Sent from a separate request context so the dropped answer never delivers its cookies, as in
  // slip-retry.spec.ts.
  const courier = await apiRequest.newContext()
  let dropped = false
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (!dropped && request.method() === 'POST' && request.headers()['next-action']) {
      dropped = true
      await courier.fetch(request)
      await route.abort('failed')
      return
    }
    await route.fallback()
  })

  const create = page.getByRole('button', { name: 'Create market' })
  await create.click()
  // Next replays the failed action on its own; if it doesn't, the member taps Create again.
  // Either way the same key goes out, and the market is made once.
  try {
    await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/, { timeout: 15_000 })
  } catch {
    await create.click()
    await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  }
  expect(dropped).toBe(true)

  const { count, error } = await serviceClient().from('markets').select('id', { count: 'exact', head: true }).eq('title', title)
  if (error) throw error
  expect(count).toBe(1)
  await courier.dispose()
})
