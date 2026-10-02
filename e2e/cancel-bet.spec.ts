import { test, expect, type Page } from '@playwright/test'
import { openPoolMarket } from './pool-market'
import { placeSolo } from './slip'
import { serverActionSettled } from './server-action'

function navBalance(page: Page) {
  return page.getByRole('banner').getByRole('link', { name: /^Balance \d+ DC, view my bets$/ })
}

async function readBalance(page: Page): Promise<number> {
  const text = await navBalance(page).textContent()
  return Number(text!.match(/\d+/)![0])
}

test('cancel an open bet from My bets: it is refunded and leaves the market', async ({ page }) => {
  const title = 'Will the sermon run past noon?'
  // Only a pool market's bets can be cancelled (0102).
  const marketPath = await openPoolMarket(page, title)

  const before = await readBalance(page)
  await placeSolo(page, 'Yes', 5)
  await expect(page.getByRole('region', { name: 'Bets' }).getByText('5 DC on Yes')).toBeVisible()
  await expect(navBalance(page)).toHaveAccessibleName(`Balance ${before - 5} DC, view my bets`)

  await page.goto('/bets')
  const row = page.getByRole('listitem', { name: title })
  const trigger = row.getByRole('button', { name: 'Cancel your 5 DC bet on Yes' })
  const dialog = page.getByRole('alertdialog', { name: 'Cancel this bet?' })

  // Cancel is drawn at the status chip's own height, not a full-size button.
  const chip = row.getByText('Open', { exact: true })
  const [chipBox, cancelBox] = [await chip.boundingBox(), await trigger.boundingBox()]
  expect(Math.abs(cancelBox!.height - chipBox!.height)).toBeLessThanOrEqual(1)

  // Keeping the bet leaves it where it was.
  await trigger.click()
  await expect(dialog.getByText('Your 5 DC on Yes comes back to your balance.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep bet' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row).toBeVisible()

  await trigger.click()
  const settled = serverActionSettled(page)
  await dialog.getByRole('button', { name: 'Cancel bet' }).click()
  await settled
  await expect(page.getByText('Bet cancelled. 5 DC refunded.')).toBeVisible()
  await expect(row).toHaveCount(0)
  await expect(navBalance(page)).toHaveAccessibleName(`Balance ${before} DC, view my bets`)

  await page.getByRole('navigation', { name: 'My bets sections' }).getByRole('link', { name: 'Cancelled' }).click()
  await expect(page).toHaveURL(/\/bets\?tab=cancelled$/)
  const cancelled = page.getByRole('listitem', { name: title })
  await expect(cancelled.getByText(/5 DC on Yes · Cancelled/)).toBeVisible()
  await expect(cancelled.getByText('Refunded')).toBeVisible()

  await page.goto(marketPath)
  const bets = page.getByRole('region', { name: 'Bets' })
  await expect(bets.getByText('No bets yet.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Outcomes' }).getByText('0 DC in the pool')).toBeVisible()
})
