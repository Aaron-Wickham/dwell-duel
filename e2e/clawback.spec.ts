import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// e2e/global-setup.ts seeds Bob beside Alice, the signed-in admin. Bob bets through his own
// session; Alice resolves, takes most of his winnings back on his Admin page, then tries to
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
  // Bob's 20 on Yes is the whole winning pool, so Yes pays him the real pool: 20 × 60 / 20 = 60.
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
  await page.getByLabel('Why did this outcome win?').fill('Checked against the recording')
  await page.getByRole('button', { name: 'Resolve market' }).click()
  await page.getByRole('button', { name: 'Confirm outcome' }).click()
  await expect(page.getByText('Resolved', { exact: true })).toBeVisible()

  const { data: afterWin, error: balanceErr } = await db.from('profiles').select('balance').eq('id', bob.id).single()
  if (balanceErr) throw balanceErr
  // The balance form lives on Bob's own Admin page (#254).
  await page.goto(`/admin/members/${bob.id}`)
  const adjust = page.getByRole('region', { name: 'Adjust balance' })
  await adjust.getByLabel('Amount').fill(String(20 - afterWin.balance))
  await adjust.getByLabel('Reason').fill('Spent elsewhere')
  await adjust.getByRole('button', { name: 'Adjust Bob' }).click()
  await page.getByRole('alertdialog', { name: 'Adjust Bob’s balance?' }).getByRole('button', { name: 'Adjust balance' }).click()
  await expect(page.getByText('20 DC', { exact: true })).toBeVisible()

  await page.goto(marketPath)
  await page.getByLabel('Winning outcome').selectOption({ label: 'No' })
  await page.getByLabel('Why did this outcome win?').fill('Checked against the recording')
  await page.getByRole('button', { name: 'Override resolution' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Override the resolution?' })).toContainText('previous payouts are reversed')
  await page.getByRole('button', { name: 'Confirm outcome' }).click()

  await expect(
    page.getByText(
      'Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override.',
    ),
  ).toBeVisible()
  await expect(page.getByLabel('Winning outcome')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Winning outcome: Yes')).toBeVisible()
})
