import { test, expect } from '@playwright/test'
import { addToSlip, openSlip } from './slip'
import { MEMBER_STORAGE_STATE_PATH } from './global-setup'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// #260. Each test's context is fresh, so neither the dismissal nor How it works' read cookie
// carries over from another spec. Service workers are blocked, so this device never has push.
test('Getting started opens with How it works, and ticks it off once the page has been read', async ({ page }) => {
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Getting started' })
  await expect(card).toBeVisible()
  await expect(card.getByText(/of 5 done/)).toBeVisible()
  const learn = card.locator('li[data-step="learn"]')
  await expect(card.locator('li[data-step]').first()).toHaveAttribute('data-step', 'learn')
  await expect(card.locator('li[data-step="notify"]').getByRole('link', { name: 'Turn on' })).toHaveAttribute(
    'href',
    '/settings#settings-notifications',
  )

  await learn.getByRole('link', { name: 'Read' }).click()
  await expect(page).toHaveURL(/\/how-it-works$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Betting' })).toBeVisible()

  await page.goto('/')
  await expect(learn.getByRole('link')).toHaveCount(0)
  await expect(learn.getByText('Learn how DwellDuel works')).toHaveClass(/line-through/)
})

// #398: How it works is the short version; the full rules are a tap away.
test('How it works answers a question in place and opens the full rules', async ({ page }) => {
  await page.goto('/how-it-works')
  const question = page.locator('summary', { hasText: 'Can I take a bet back?' })
  await expect(page.getByText(/Bets and parlays are final once placed/)).toBeHidden()
  await question.click()
  await expect(page.getByText(/Bets and parlays are final once placed/)).toBeVisible()

  await page.getByRole('link', { name: 'Read the full rules' }).click()
  await expect(page).toHaveURL(/\/how-it-works\/rules$/)
  await expect(page.getByRole('heading', { level: 1, name: 'How DwellDuel works' })).toBeVisible()
})

test('the full rules have a collapsed On this page list on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/how-it-works/rules')
  await expect(page.getByRole('navigation', { name: 'Contents' })).toBeHidden()
  const list = page.getByRole('navigation', { name: 'On this page' })
  await expect(list).toBeHidden()
  await page.getByText('On this page').click()
  await list.getByRole('link', { name: 'Tasks' }).click()
  await expect(page).toHaveURL(/#how-tasks$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Tasks' })).toBeInViewport()
})

test('a member at 0 DC is pointed to Tasks on Home and in the slip, which keeps the picks', async ({ browser }) => {
  const db = serviceClient()
  const { data: bob, error } = await db.from('profiles').select('id, balance').eq('email', 'bob@example.com').single()
  if (error) throw error
  const { data: created, error: createErr } = await (await clientForEmail('bob@example.com')).rpc('create_market_v3', {
    p_title: 'Will Bob find the Tasks page?',
    p_description: null,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  if (createErr) throw createErr
  const marketId = (created as { market_id: string }).market_id

  const context = await browser.newContext({ storageState: MEMBER_STORAGE_STATE_PATH })
  const page = await context.newPage()
  try {
    await db.from('profiles').update({ balance: 0 }).eq('id', bob.id)

    await page.goto('/')
    // Home's Needs you (#388).
    const earn = page.getByRole('region', { name: 'Needs you' }).getByRole('link', { name: /You’re out of Dwell Coin\. Earn more with Tasks/ })
    await expect(earn).toBeVisible()
    await expect(earn).toHaveAttribute('href', '/tasks')

    await page.goto(`/markets/${marketId}`)
    await addToSlip(page, 'Yes')
    const sheet = await openSlip(page)
    await expect(sheet.getByText('Balance 0 DC')).toBeVisible()
    await expect(sheet.getByText('You have 0 DC. Earn more with Tasks, then come back to this slip.')).toBeVisible()
    await sheet.getByLabel('Stake (DC)').fill('5')
    await expect(sheet.getByText('5 DC short')).toBeVisible()
    const place = sheet.getByRole('button', { name: 'Place bet · 5 DC' })
    await expect(place).toHaveAttribute('aria-disabled', 'true')
    await expect(place).toHaveAccessibleDescription('You have 0 DC. Earn more with Tasks, then come back to this slip.')
    await expect(sheet.getByText('Will Bob find the Tasks page?')).toBeVisible()
  } finally {
    await db.from('profiles').update({ balance: bob.balance }).eq('id', bob.id)
    await context.close()
  }
})
