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
