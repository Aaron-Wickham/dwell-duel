import { test, expect, request as apiRequest } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { addToSlip, openSlip } from './slip'
import { serviceClient } from '../tests/db/helpers'

// #61: the place commits, but its answer never reaches the phone. Retrying must show success
// without placing the bet a second time.
test('a place whose response is lost can be retried without placing twice', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Lost response?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  const marketId = new URL(page.url()).pathname.split('/').at(-1)!
  await addToSlip(page, 'Yes')

  // Let the first place reach the server, then drop its answer. It's sent from a separate request
  // context: route.fetch() shares the page's cookie jar, and a really lost answer never delivers
  // its Set-Cookie (the emptied slip) either.
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

  const sheet = await openSlip(page)
  await sheet.getByLabel('Stake (DC)').fill('7')
  const place = sheet.getByRole('button', { name: 'Place 1 bet · 7 DC' })
  await place.click()
  // Next replays an action whose fetch failed as if it never reached the server; if it doesn't,
  // the slip says it couldn't confirm and the member taps Place again. Either way, one bet.
  const placed = page.getByText('Placed 1 solo bet.').first()
  const unconfirmed = sheet.getByText(/couldn’t confirm your bets/)
  await expect(placed.or(unconfirmed)).toBeVisible()
  if (await unconfirmed.isVisible()) {
    // #192: closing the sheet unmounts the panel. The key and the message live in the provider,
    // so reopening shows the same message, and Place returns the first result.
    await sheet.getByRole('button', { name: 'Close slip' }).click()
    await expect(sheet).toHaveCount(0)
    const reopened = await openSlip(page)
    await expect(reopened.getByText(/couldn’t confirm your bets/)).toBeVisible()
    await expect(reopened.getByLabel('Stake (DC)')).toHaveValue('7')
    await reopened.getByRole('button', { name: 'Place 1 bet · 7 DC' }).click()
  }
  await expect(placed).toBeVisible()
  expect(dropped).toBe(true)

  const { count, error } = await serviceClient().from('bets').select('id', { count: 'exact', head: true }).eq('market_id', marketId)
  if (error) throw error
  expect(count).toBe(1)
  await courier.dispose()
})
