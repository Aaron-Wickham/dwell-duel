import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { clientForEmail } from '../tests/db/fixtures'
import { MEMBER_STORAGE_STATE_PATH } from './global-setup'
import { lmsrQuote } from '../lib/markets/pricing'

test('void a market through the confirmation dialog', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the potluck run out of rolls?')
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const trigger = page.getByRole('button', { name: 'Void this market', exact: true })
  const dialog = page.getByRole('alertdialog', { name: 'Void this market?' })

  // Every void says why: with no reason the browser holds the submit and no dialog opens.
  await trigger.click()
  await expect(dialog).toHaveCount(0)
  await page.getByLabel('Why void this market?').fill('The potluck was moved to next month.')

  await trigger.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    await expect(dialog.locator(':focus')).toHaveCount(1)
  }

  // An alert dialog needs an answer: pressing the backdrop doesn't dismiss it.
  await page.mouse.click(5, 5)
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('button', { name: 'Add Yes to slip' })).toBeVisible()

  await trigger.click()
  await dialog.getByRole('button', { name: 'Void market', exact: true }).click()

  const outcomes = page.getByRole('region', { name: 'Outcomes' })
  await expect(outcomes.getByText('This market was voided. Every bet was refunded, and parlays dropped this pick.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Void market' })).toHaveCount(0)
  // The void card unmounts on success; the toast must survive that.
  await expect(page.getByText('Market voided.')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(trigger).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Why it was voided' })).toHaveText('The potluck was moved to next month.')
})

test('a creator with a stake in their own market isn’t offered Void', async ({ browser }) => {
  // Bob, a plain member: the owner (the default session) may always void.
  const bob = await clientForEmail('bob@example.com')
  const create = (title: string) =>
    bob.rpc('create_market_v3', {
      p_title: title,
      p_description: null as unknown as string,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
  const staked = await create('Will the choir sing four songs?')
  const unstaked = await create('Will the choir sing five songs?')
  if (staked.error) throw staked.error
  if (unstaked.error) throw unstaked.error
  const stakedId = (staked.data as { market_id: string }).market_id
  const { data: outcome } = await bob.from('market_outcomes').select('id').eq('market_id', stakedId).eq('label', 'Yes').single()
  const { payout } = lmsrQuote([0, 0], 50, 0, 5)
  const placed = await bob.rpc('place_slip_v4', {
    p_singles: [{ outcome_id: outcome!.id, amount: 5, payout }],
    p_parlay_outcome_ids: [],
    p_parlay_stake: 0,
  })
  if (placed.error) throw placed.error

  const member = await browser.newContext({ storageState: MEMBER_STORAGE_STATE_PATH })
  try {
    const page = await member.newPage()
    // void_market refuses since 0104; can_void_market (0105) keeps the page from offering it.
    await page.goto(`/markets/${stakedId}`)
    await expect(page.getByText('only an admin can void it')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Void this market', exact: true })).toHaveCount(0)

    await page.goto(`/markets/${(unstaked.data as { market_id: string }).market_id}`)
    await expect(page.getByRole('button', { name: 'Void this market', exact: true })).toBeVisible()
  } finally {
    await member.close()
  }
})
