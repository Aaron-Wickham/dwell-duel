import { chromium } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { seedMembers, clientFor, sessionCookieHeader } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

loadEnv({ path: '.env.local', quiet: true })

export const STORAGE_STATE_PATH = 'e2e/.auth/session.json'

/**
 * Real Google OAuth can't run in CI, so this seeds a real session for a
 * fixture member the same way tests/db's suite already does (magic-link
 * generation + verifyOtp), promotes them to admin so one seeded session
 * can cover both the home shell and the admin invites page, then injects
 * the resulting cookies directly into a fresh browser context.
 */
export default async function globalSetup(): Promise<void> {
  const [alice] = await seedMembers()
  await serviceClient().from('profiles').update({ role: 'owner' }).eq('id', alice.id)

  // seedMembers()/makeMember() create alice's profile directly via the
  // service-role client, bypassing the real invite-claim flow — unlike an
  // actual sign-in, no allowed_emails row for her exists yet. Since
  // migration 0006 tightened select_all_profiles to require is_invited(),
  // alice needs a matching allowed_emails row to read her own profile on
  // the home page, same as any real invited member would have.
  await serviceClient().from('allowed_emails').insert({ email: alice.email, claimed_by: alice.id })

  const client = await clientFor(alice)
  const cookieHeader = await sessionCookieHeader(client)

  const cookies = cookieHeader.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name, value: rest.join('='), domain: 'localhost', path: '/' }
  })

  const browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addCookies(cookies)
  await context.storageState({ path: STORAGE_STATE_PATH })
  await browser.close()
}
