import { test, expect } from '@playwright/test'
import { MEMBER_STORAGE_STATE_PATH } from './global-setup'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// A member's Admin page (#254) sits outside the Admin sections' layout, so it checks the role itself.
const MEMBER_PAGE = '/admin/members/00000000-0000-4000-8000-000000000000'
const ADMIN_PAGES = ['/admin/invites', '/admin/markets', '/admin/members', MEMBER_PAGE, '/admin/ledger', '/admin/tasks']

test('a plain member is sent home from every admin page', async ({ browser }) => {
  const member = await browser.newContext({ storageState: MEMBER_STORAGE_STATE_PATH })
  const page = await member.newPage()
  for (const path of ADMIN_PAGES) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: /^Hi, / })).toBeVisible()
  }
  await member.close()
})

test('a reviewer is sent from the admin-only pages to the approval queue', async ({ browser }) => {
  const db = serviceClient()
  const { data: bob, error } = await db.from('profiles').select('id').eq('email', 'bob@example.com').single()
  if (error) throw error
  const { error: promoteErr } = await db.from('profiles').update({ role: 'reviewer' }).eq('id', bob.id)
  if (promoteErr) throw promoteErr

  const member = await browser.newContext({ storageState: MEMBER_STORAGE_STATE_PATH })
  try {
    const page = await member.newPage()
    for (const path of ['/admin/members', MEMBER_PAGE, '/admin/invites', '/admin/markets', '/admin/ledger']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/admin\/tasks$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Admin' })).toBeVisible()
    }
    // A reviewer reviews; creating tasks stays with admins.
    await expect(page.getByRole('button', { name: 'Create task' })).toHaveCount(0)
  } finally {
    await member.close()
    await db.from('profiles').update({ role: 'member' }).eq('id', bob.id)
  }
})

test('a plain member sees no admin controls on someone else’s market, and no Admin link', async ({ browser }) => {
  const alice = await clientForEmail('alice@example.com')
  const { data: created, error } = await alice.rpc('create_market_v3', {
    p_title: 'Will the choir start on time?',
    p_description: null,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  if (error) throw error
  const marketId = (created as { market_id: string }).market_id
  const marketPath = `/markets/${marketId}`

  // Alice's own bet, so the Bets list has a row for a control to show on.
  const { data: outcomes, error: outcomesErr } = await serviceClient().from('market_outcomes').select('id, label').eq('market_id', marketId)
  if (outcomesErr) throw outcomesErr
  const { error: betErr } = await alice.rpc('place_slip_v4', {
    p_singles: [{ outcome_id: outcomes.find((o) => o.label === 'Yes')!.id, amount: 1, payout: 1 }],
    p_parlay_outcome_ids: [],
    p_parlay_stake: 0,
  })
  if (betErr) throw betErr

  const member = await browser.newContext({ storageState: MEMBER_STORAGE_STATE_PATH })
  const bobPage = await member.newPage()
  await bobPage.goto(marketPath)
  await expect(bobPage.getByRole('heading', { level: 1, name: 'Will the choir start on time?' })).toBeVisible()
  await expect(bobPage.getByRole('region', { name: 'Bets' }).getByText('1 DC on Yes')).toBeVisible()
  // #84: every member sees what the creator has riding on their own market.
  await expect(bobPage.getByText('Alice has 1 DC on Yes.')).toBeVisible()
  await expect(bobPage.getByRole('region', { name: 'Outcomes' }).getByRole('button', { name: 'Add Yes to slip' })).toBeVisible()

  await expect(bobPage.getByRole('button', { name: 'Call off this market' })).toHaveCount(0)
  await expect(bobPage.getByRole('button', { name: 'Resolve market' })).toHaveCount(0)
  await expect(bobPage.getByRole('button', { name: 'Delete this market' })).toHaveCount(0)
  await expect(bobPage.getByRole('button', { name: /^Remove / })).toHaveCount(0)
  await expect(bobPage.getByRole('button', { name: /^Cancel / })).toHaveCount(0)
  await expect(bobPage.getByLabel('Winning outcome')).toHaveCount(0)

  // Every place the Admin link could show: the avatar menu and Home's Needs you.
  for (const path of [marketPath, '/']) {
    await bobPage.goto(path)
    await expect(bobPage.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await expect(bobPage.locator('a[href^="/admin"]')).toHaveCount(0)
    await bobPage.getByRole('banner').getByRole('button', { name: /^Your profile and settings/ }).click()
    await expect(bobPage.getByRole('menu').getByRole('menuitem', { name: /Settings/ })).toBeVisible()
    await expect(bobPage.getByRole('menu').getByRole('menuitem', { name: /Admin/ })).toHaveCount(0)
    await bobPage.keyboard.press('Escape')
  }
  await member.close()
})
