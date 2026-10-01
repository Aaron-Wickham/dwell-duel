import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('a signed-out request for a signed-in page gets a real 307 to sign-in', async ({ request }) => {
  for (const path of ['/', '/markets', '/markets/not-a-uuid', '/members/00000000-0000-4000-8000-000000000000', '/admin/invites']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(307)
    expect(new URL(response.headers()['location'], 'http://localhost').pathname, path).toBe('/sign-in')
  }

  const signIn = await request.get('/sign-in', { maxRedirects: 0 })
  expect(signIn.status()).toBe(200)
})

// #263. Google can't run here, so the hop to Supabase's authorize endpoint is stopped and
// inspected instead: it must ask for Google's account chooser, and the page asked for must be
// waiting in the cookie /callback reads.
test('a deep link survives sign-in: the page asked for rides through to the callback', async ({ page, request }) => {
  const response = await request.get('/markets/00000000-0000-4000-8000-000000000000?from=share', { maxRedirects: 0 })
  expect(response.status()).toBe(307)
  const location = new URL(response.headers()['location'], 'http://localhost')
  expect(location.pathname).toBe('/sign-in')
  expect(location.searchParams.get('next')).toBe('/markets/00000000-0000-4000-8000-000000000000?from=share')

  const authorize = page.waitForRequest(/\/auth\/v1\/authorize/)
  await page.route(/\/auth\/v1\/authorize/, (route) => route.abort())
  await page.goto(`${location.pathname}${location.search}`)
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  const url = new URL((await authorize).url())
  expect(url.searchParams.get('provider')).toBe('google')
  expect(url.searchParams.get('prompt')).toBe('select_account')

  const cookies = await page.context().cookies('http://localhost:3000/callback')
  const next = cookies.find((c) => c.name === 'sign-in-next')
  expect(next?.path).toBe('/callback')
  expect(decodeURIComponent(next!.value)).toBe('/markets/00000000-0000-4000-8000-000000000000?from=share')
})

test('sign-in ignores a next that would leave the site', async ({ page }) => {
  await page.route(/\/auth\/v1\/authorize/, (route) => route.abort())
  const authorize = page.waitForRequest(/\/auth\/v1\/authorize/)
  await page.goto('/sign-in?next=%2F%2Fevil.example')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await authorize
  const cookies = await page.context().cookies('http://localhost:3000/callback')
  expect(cookies.find((c) => c.name === 'sign-in-next')).toBeUndefined()
})

test('not-invited names the refused account once, and Try another account keeps the destination', async ({ page }) => {
  // The callback sets this cookie when Google's account isn't invited; Google can't run here.
  await page.context().addCookies([
    { name: 'not-invited-email', value: 'wrong@example.com', domain: 'localhost', path: '/not-invited', httpOnly: true },
  ])
  await page.goto('/not-invited?next=%2Fmarkets')
  await expect(page.getByText('You signed in as wrong@example.com.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Try another account' })).toHaveAttribute('href', '/sign-in?next=%2Fmarkets')
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === 'not-invited-email')).toBe(false)
  // Clearing the cookie mustn't re-render the email away: it stays on screen afterwards.
  await page.waitForTimeout(2000)
  await expect(page.getByText('You signed in as wrong@example.com.')).toBeVisible()
  await page.reload()
  await expect(page.getByText(/You signed in as/)).toHaveCount(0)
})
