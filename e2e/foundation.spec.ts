import { test, expect } from '@playwright/test'
import { makeMember, clientFor, sessionCookieHeader } from '../tests/db/fixtures'

test('signed-in member sees their name and balance', async ({ page }) => {
  // Every e2e spec file shares this one seeded, admin-promoted session
  // (e2e/global-setup.ts) -- a coin-earning feature can legitimately grow
  // this balance past its starting 100 depending on test execution order,
  // so this only asserts a balance is shown at all, not a specific value.
  await page.goto('/')
  await expect(page.getByText('Alice', { exact: false })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your balance' }).getByText(/^\d+ DC$/).first()).toBeAttached()
})

test('admin can add and revoke an invite', async ({ page }) => {
  await page.goto('/admin/invites')
  await page.getByPlaceholder('friend@gmail.com').fill('newperson@example.com')
  await page.getByRole('button', { name: 'Add invite' }).click()
  await expect(page.getByText('newperson@example.com')).toBeVisible()

  await page.getByRole('button', { name: 'Revoke newperson@example.com' }).click()
  await page.getByRole('button', { name: 'Revoke invite' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('newperson@example.com', { exact: true })).not.toBeVisible()
})

test('sign-out returns to the sign-in page', async ({ browser }) => {
  // Deliberately does NOT use the shared `page` fixture (loaded from the
  // one session global-setup.ts injects) -- supabase.auth.signOut() revokes
  // the session server-side, not just the local browser cookie, which
  // would break every other e2e test still relying on that shared session
  // (all spec files, run in any order, share one seeded admin profile).
  // This test gets its own throwaway member and session instead, so
  // signing it out can't affect anything else.
  const member = await makeMember('SignOutOnly')
  const cookieHeader = await sessionCookieHeader(await clientFor(member))
  const cookies = cookieHeader.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name, value: rest.join('='), domain: 'localhost', path: '/' }
  })

  const context = await browser.newContext()
  await context.addCookies(cookies)
  const page = await context.newPage()

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)

  await context.close()
})
