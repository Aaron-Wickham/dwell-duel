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

// #329: an iPhone SE's viewport. The intro sentence drops out so the sign-in button is on screen without
// scrolling, once the intro (if any) has settled.
test('on a short phone the sign-in button stays above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/sign-in')
  await expect(page.getByText(/^Bet on friendly questions/)).toBeHidden()
  const button = page.getByRole('button', { name: 'Sign in with Google' })
  await expect(button).toBeInViewport({ ratio: 1 })
})

// #329: once a session, and reduced motion skips it, so the page opens on its final frame.
test('the sign-in intro plays once a session', async ({ page }) => {
  await page.goto('/sign-in')
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('dd-sign-in-intro'))).toBe('1')
  // Over: the attribute goes, and the sample rests at 61%.
  await expect.poll(() => page.evaluate(() => 'signInIntro' in document.documentElement.dataset), { timeout: 5_000 }).toBe(false)
  await page.reload()
  expect(await page.evaluate(() => 'signInIntro' in document.documentElement.dataset)).toBe(false)
})

test('the sign-in page says what DwellDuel is, and the privacy page is public', async ({ page, request }) => {
  const privacy = await request.get('/privacy', { maxRedirects: 0 })
  expect(privacy.status()).toBe(200)

  await page.goto('/sign-in')
  await expect(page.getByText('Earn DC with Bible-study tasks')).toBeVisible()
  await expect(page.getByRole('img', { name: /^Sample market: Will the sermon run past noon\?/ })).toBeVisible()
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expect(page.getByText(/Who runs it:/)).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
})

test('Google’s POST to /auth/google is refused without a matching state cookie, or without the nonce', async ({ request, page }) => {
  const post = (cookie: string, state: string) =>
    request.post('/auth/google', { form: { id_token: 'a.b.c', state }, headers: { cookie }, maxRedirects: 0 })

  const noCookie = await post('', 'state-1')
  expect(noCookie.status()).toBe(303)
  expect(noCookie.headers()['location']).toMatch(/\/sign-in\?error=auth$/)

  const mismatch = await post('google-state=state-2', 'state-1')
  expect(mismatch.headers()['location']).toMatch(/\/sign-in\?error=auth$/)

  const noNonce = await post('google-state=state-1', 'state-1')
  expect(noNonce.headers()['location']).toMatch(/\/sign-in\?error=expired$/)

  await page.goto('/sign-in?error=expired')
  await expect(page.getByText('That sign-in expired or was started in another tab. Try again.')).toBeVisible()
})

// Google can't run here, so its authorize page is replaced by a stand-in that posts back the way
// Google does (form_post): an ID token carrying the nonce, and the state, to redirect_uri. It's
// served from our own origin, since over plain http the cookies are Lax and a cross-site POST
// wouldn't carry them (over https they're SameSite=None, which the unit tests check).
function googleStandIn(url: URL): string {
  const payload = Buffer.from(JSON.stringify({ nonce: url.searchParams.get('nonce') })).toString('base64url')
  const field = (name: string, value: string) => `<input type="hidden" name="${name}" value="${value}">`
  return `<form method="POST" action="${url.searchParams.get('redirect_uri')}">${field('id_token', `e30.${payload}.sig`)}${field('state', url.searchParams.get('state') ?? '')}</form><script>document.forms[0].submit()</script>`
}

test('with a Google client ID, sign-in goes straight to Google, which posts back to /auth/google', async ({ page }) => {
  test.skip(!googleClientId, 'needs NEXT_PUBLIC_GOOGLE_CLIENT_ID at build and here')
  let authorize: URL | null = null
  await page.route('https://accounts.google.com/o/oauth2/v2/auth?**', (route) => {
    authorize = new URL(route.request().url())
    const ours = new URL(authorize.searchParams.get('redirect_uri')!).origin
    // A script rather than a 302: Playwright doesn't route a request a redirect made.
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace('${ours}/e2e-google-stand-in')</script>` })
  })
  await page.route('**/e2e-google-stand-in', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: googleStandIn(authorize!) }))
  await page.goto('/sign-in?next=%2Fmarkets%3Ffrom%3Dshare')
  await page.getByRole('button', { name: 'Sign in with Google' }).click()

  // The stand-in's token passes the state and nonce checks, so it reaches Supabase, which refuses it,
  // and the member is back at sign-in with the destination kept.
  await expect(page).toHaveURL(/\/sign-in\?error=auth&next=%2Fmarkets%3Ffrom%3Dshare$/)
  await expect(page.getByText('Something went wrong signing you in. Try again.')).toBeVisible()
  expect(Object.fromEntries(authorize!.searchParams)).toMatchObject({
    client_id: googleClientId,
    redirect_uri: 'http://localhost:3000/auth/google',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'select_account',
  })
  expect(authorize!.searchParams.get('nonce')).toMatch(/^[0-9a-f]{64}$/)

  // Supabase's redirect beside it, in case the direct path is what failed.
  await page.route(/\/auth\/v1\/authorize/, (route) => route.abort())
  const supabase = page.waitForRequest(/\/auth\/v1\/authorize/)
  await page.getByRole('button', { name: 'Try another way' }).click()
  expect(new URL((await supabase).url()).searchParams.get('prompt')).toBe('select_account')
})

test('without a Google client ID, sign-in goes through Supabase, never to Google directly', async ({ page }) => {
  test.skip(!!googleClientId, 'only without NEXT_PUBLIC_GOOGLE_CLIENT_ID')
  const gis: string[] = []
  page.on('request', (r) => {
    if (r.url().startsWith('https://accounts.google.com/')) gis.push(r.url())
  })
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  expect(gis).toEqual([])
})
