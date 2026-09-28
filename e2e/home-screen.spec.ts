import { test, expect } from '@playwright/test'

test('the app installs to the home screen with its manifest, splash screens and edge-to-edge viewport', async ({ page, request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/manifest+json')
  expect(await response.json()).toMatchObject({
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    name: 'DwellDuel',
    background_color: '#03272d',
    theme_color: '#03272d',
    shortcuts: [
      { name: 'Markets', url: '/markets' },
      { name: 'My bets', url: '/bets' },
    ],
  })
  expect((await request.get('/site.webmanifest')).status()).toBe(404)

  // The sign-in page renders the root layout's head without depending on the session.
  await page.goto('/sign-in')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /interactive-widget=resizes-content/)
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent')

  const splashes = page.locator('link[rel="apple-touch-startup-image"]')
  await expect(splashes).toHaveCount(11)
  const firstSplash = await splashes.first().getAttribute('href')
  const image = await request.get(firstSplash!)
  expect(image.status()).toBe(200)
  expect(image.headers()['content-type']).toBe('image/png')
})
