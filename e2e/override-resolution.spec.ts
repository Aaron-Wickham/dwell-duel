import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// Bob bets on Yes and Alice, the owner, on No; she resolves Yes, then overrides to No, which takes
// his winnings back. He ends 10 DC down, just as if No had won the first time. (Alice's stake is
// there because a winning outcome nobody backed refunds everyone.)
test('an admin overrides a resolved market through the confirmation dialog', async ({ page }) => {
  const db = serviceClient()
  const { data: bob, error } = await db.from('profiles').select('id, balance').eq('email', 'bob@example.com').single()
  if (error) throw error
  if (bob.balance < 10) {
    const { error: topUpErr } = await db.rpc('apply_coin_transaction', { p_profile_id: bob.id, p_amount: 10 - bob.balance, p_type: 'test_top_up' })
    if (topUpErr) throw topUpErr
  }
  const bobBalance = async () => {
    const { data, error: readErr } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    if (readErr) throw readErr
    return data.balance as number
  }
  const start = await bobBalance()

  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the youth group win the quiz?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  const marketId = new URL(page.url()).pathname.split('/').at(-1)!

  const { data: outcomes, error: outcomesErr } = await db.from('market_outcomes').select('id, label').eq('market_id', marketId)
  if (outcomesErr) throw outcomesErr
  for (const [email, label, amount] of [
    ['bob@example.com', 'Yes', 10],
    ['alice@example.com', 'No', 5],
  ] as const) {
    const { error: betErr } = await (await clientForEmail(email)).rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomes.find((o) => o.label === label)!.id,
      p_amount: amount,
    })
    if (betErr) throw betErr
  }

  await page.reload()
  await page.getByLabel('Winning outcome').selectOption({ label: 'Yes' })
  await page.getByLabel('Why did this outcome win?').fill('They answered the last question first')
  await page.getByRole('button', { name: 'Resolve market' }).click()
  await page.getByRole('alertdialog', { name: 'Resolve this market?' }).getByRole('button', { name: 'Confirm outcome' }).click()
  await expect(page.getByText('Status: resolved')).toBeVisible()
  await expect(page.getByText('Winning outcome: Yes')).toBeVisible()
  await expect.poll(bobBalance).toBeGreaterThan(start - 10)

  const manage = page.getByRole('region', { name: 'Override resolution' })
  await expect(manage.getByText('A new outcome reverses the payouts and pays the new winners.')).toBeVisible()
  await manage.getByLabel('Winning outcome').selectOption({ label: 'No' })
  await manage.getByLabel('Why did this outcome win?').fill('The judges recounted: the adults won')
  await manage.getByRole('button', { name: 'Override resolution' }).click()

  // Nothing changes until the dialog is confirmed; backing out leaves Yes standing.
  const dialog = page.getByRole('alertdialog', { name: 'Override the resolution?' })
  await expect(dialog.getByText('No wins.')).toBeVisible()
  await expect(dialog.getByText(/The previous payouts are reversed/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Winning outcome: Yes')).toBeVisible()

  await manage.getByRole('button', { name: 'Override resolution' }).click()
  await dialog.getByRole('button', { name: 'Confirm outcome' }).click()
  await expect(page.getByText('Resolution overridden.').first()).toBeVisible()
  await expect(page.getByText('Winning outcome: No')).toBeVisible()
  const why = page.getByRole('region', { name: 'Why it resolved this way' })
  await expect(why.getByText('The judges recounted: the adults won')).toBeVisible()
  await expect(why.getByText(/Changed from/)).toContainText('Yes')
  await expect(why.getByText(/Earlier reason: “They answered the last question first”/)).toBeVisible()
  await expect.poll(bobBalance).toBe(start - 10)
})
