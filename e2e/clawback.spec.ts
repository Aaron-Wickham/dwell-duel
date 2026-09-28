import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// e2e/global-setup.ts seeds Bob beside Alice, the signed-in admin. Bob bets through his own
// session; Alice resolves, takes most of his winnings back on /admin/members, then tries to
// override. Alice's own balance never moves, so the specs that read it are unaffected.
test('an override is blocked, naming the member who has spent their winnings', async ({ page }) => {
  const db = serviceClient()
  const { data: bob, error } = await db.from('profiles').select('id, balance').eq('email', 'bob@example.com').single()
  if (error) throw error
  // A retry starts from the 20 DC the first attempt left him.
  if (bob.balance < 60) {
    const { error: topUpErr } = await db.rpc('apply_coin_transaction', {
      p_profile_id: bob.id,
      p_amount: 60 - bob.balance,
      p_type: 'test_top_up',
    })
    if (topUpErr) throw topUpErr
  }
  const bobClient = await clientForEmail('bob@example.com')

  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the override be blocked?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  const marketPath = new URL(page.url()).pathname
  const marketId = marketPath.split('/').at(-1)!

  const { data: outcomes, error: outcomesErr } = await db.from('market_outcomes').select('id, label').eq('market_id', marketId)
  if (outcomesErr) throw outcomesErr
  // Bob's 20 on Yes is the whole winning pool. With the market's 20 DC seed per outcome, Yes pays
  // him floor(20 × (60 + 40) / (20 + 20)) = 50.
  for (const [label, amount] of [
    ['Yes', 20],
    ['No', 40],
  ] as const) {
    const { error: betErr } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomes.find((o) => o.label === label)!.id,
      p_amount: amount,
    })
    if (betErr) throw betErr
  }

  await page.reload()
  await page.getByLabel('Winning outcome').selectOption({ label: 'Yes' })
  await page.getByRole('button', { name: 'Confirm outcome' }).click()
  await expect(page.getByText('Status: resolved')).toBeVisible()

  const { data: afterWin, error: balanceErr } = await db.from('profiles').select('balance').eq('id', bob.id).single()
  if (balanceErr) throw balanceErr
  await page.goto('/admin/members')
  const bobRow = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Bob', exact: true }) })
  await bobRow.getByLabel('Amount').fill(String(20 - afterWin.balance))
  await bobRow.getByLabel('Reason').fill('Spent elsewhere')
  await bobRow.getByRole('button', { name: 'Adjust Bob' }).click()
  await expect(bobRow.getByText('20 DC', { exact: true })).toBeVisible()

  await page.goto(marketPath)
  await page.getByLabel('Winning outcome').selectOption({ label: 'No' })
  await page.getByRole('button', { name: 'Confirm outcome' }).click()

  await expect(
    page.getByText(
      'Can’t override: Bob has already spent 30 of 50 DC won on this market. Adjust their balances first if you still want to override.',
    ),
  ).toBeVisible()
  await expect(page.getByLabel('Winning outcome')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Winning outcome: Yes')).toBeVisible()
})
