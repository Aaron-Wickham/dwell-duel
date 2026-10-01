import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

// Fixed at build: with it, sign-in shows Google's own button; without it, Supabase's Google redirect.
// Run the suite once each way (docs/ARCHITECTURE.md, Signing in).
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

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
  test.skip(!!googleClientId, 'Supabase’s redirect is the fallback without a Google client ID')
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
  test.skip(!!googleClientId, 'Supabase’s redirect is the fallback without a Google client ID')
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

test('the sign-in page says what DwellDuel is, and the privacy page is public', async ({ page, request }) => {
  const privacy = await request.get('/privacy', { maxRedirects: 0 })
  expect(privacy.status()).toBe(200)

  await page.goto('/sign-in')
  await expect(page.getByText(/prediction game for our church friend group/)).toBeVisible()
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expect(page.getByText(/Who runs it:/)).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
})

test('Google’s POST to /auth/google is refused without a matching CSRF cookie, or without the nonce', async ({ request, page }) => {
  const post = (cookie: string, csrf: string) =>
    request.post('/auth/google', { form: { credential: 'a.b.c', g_csrf_token: csrf }, headers: { cookie }, maxRedirects: 0 })

  const noCookie = await post('', 'csrf-1')
  expect(noCookie.status()).toBe(303)
  expect(noCookie.headers()['location']).toMatch(/\/sign-in\?error=auth$/)

  const mismatch = await post('g_csrf_token=csrf-2', 'csrf-1')
  expect(mismatch.headers()['location']).toMatch(/\/sign-in\?error=auth$/)

  const noNonce = await post('g_csrf_token=csrf-1', 'csrf-1')
  expect(noNonce.headers()['location']).toMatch(/\/sign-in\?error=expired$/)

  await page.goto('/sign-in?error=expired')
  await expect(page.getByText('That sign-in expired or was started in another tab. Try again.')).toBeVisible()
})

// Google can't run here, so its script is replaced by a stand-in that records the configuration and
// posts the way Google does: the credential and the double-submit CSRF token, to login_uri.
const GIS_STUB = `
window.google = { accounts: { id: {
  initialize: (config) => { window.__gis = config },
  renderButton: (parent) => {
    const button = document.createElement('button')
    button.textContent = 'Stand-in Google button'
    button.onclick = () => {
      const payload = btoa(JSON.stringify({ nonce: window.__gis.nonce })).replace(/=+$/, '')
      document.cookie = 'g_csrf_token=csrf-e2e; path=/'
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = window.__gis.login_uri
      for (const [name, value] of [['credential', 'e30.' + payload + '.sig'], ['g_csrf_token', 'csrf-e2e']]) {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = name
        input.value = value
        form.appendChild(input)
      }
      document.body.appendChild(form)
      form.submit()
    }
    parent.appendChild(button)
  },
} } }`

test('with a Google client ID, sign-in shows Google’s button in redirect mode, posting to /auth/google', async ({ page }) => {
  test.skip(!googleClientId, 'needs NEXT_PUBLIC_GOOGLE_CLIENT_ID at build and here')
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: GIS_STUB }),
  )
  await page.goto('/sign-in?next=%2Fmarkets%3Ffrom%3Dshare')
  await expect(page.getByRole('button', { name: 'Stand-in Google button' })).toBeVisible()

  const config = await page.evaluate(() => (window as unknown as { __gis: Record<string, unknown> }).__gis)
  expect(config).toMatchObject({ client_id: googleClientId, ux_mode: 'redirect', login_uri: 'http://localhost:3000/auth/google', auto_select: false })
  expect(config.nonce).toMatch(/^[0-9a-f]{64}$/)

  const cookies = await page.context().cookies('http://localhost:3000/auth/google')
  const nonce = cookies.find((c) => c.name === 'google-nonce')
  // Plain http here: Lax and not Secure. Over https they're SameSite=None; Secure (unit-tested).
  expect(nonce).toMatchObject({ path: '/auth/google', httpOnly: true, sameSite: 'Lax', secure: false })
  expect(decodeURIComponent(cookies.find((c) => c.name === 'sign-in-next')!.value)).toBe('/markets?from=share')

  // The stand-in's token passes the CSRF and nonce checks, so it reaches Supabase, which refuses it,
  // and the member is back at sign-in with the destination kept and the nonce spent.
  await page.getByRole('button', { name: 'Stand-in Google button' }).click()
  await expect(page).toHaveURL(/\/sign-in\?error=auth&next=%2Fmarkets%3Ffrom%3Dshare$/)
  await expect(page.getByText('Something went wrong signing you in. Try again.')).toBeVisible()
  // Google's button again, and Supabase's redirect beside it, in case Google's path is what failed.
  await expect(page.getByRole('button', { name: 'Stand-in Google button' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try another way' })).toBeVisible()
})

test('with a Google client ID, sign-in falls back to Supabase’s redirect when Google’s script can’t load', async ({ page }) => {
  test.skip(!googleClientId, 'needs NEXT_PUBLIC_GOOGLE_CLIENT_ID at build and here')
  await page.route('https://accounts.google.com/gsi/client', (route) => route.abort())
  await page.route(/\/auth\/v1\/authorize/, (route) => route.abort())
  const authorize = page.waitForRequest(/\/auth\/v1\/authorize/)
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  expect(new URL((await authorize).url()).searchParams.get('prompt')).toBe('select_account')
})

test('without a Google client ID, sign-in never loads Google’s script', async ({ page }) => {
  test.skip(!!googleClientId, 'only without NEXT_PUBLIC_GOOGLE_CLIENT_ID')
  const gis: string[] = []
  page.on('request', (r) => {
    if (r.url().startsWith('https://accounts.google.com/')) gis.push(r.url())
  })
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  expect(gis).toEqual([])
})
