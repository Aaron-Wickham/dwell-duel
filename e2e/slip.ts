import { expect, type Page } from '@playwright/test'
import { serverActionSettled } from './server-action'

// Every bet goes through the slip now: add the outcome, open the slip, stake it, place it.

export async function addToSlip(page: Page, outcome: string): Promise<void> {
  const settled = serverActionSettled(page)
  const row = page.getByRole('region', { name: 'Outcomes' }).getByRole('listitem').filter({ hasText: outcome })
  await row.getByRole('button', { name: `Add to slip ${outcome}` }).click()
  await expect(row.getByText('In your slip')).toBeVisible()
  await settled
}

export async function openSlip(page: Page) {
  await page.getByRole('button', { name: /^Slip \(\d+\)$/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Your slip' })
  await expect(sheet).toBeVisible()
  return sheet
}

// Places a solo bet from the market page on screen, starting from an empty slip.
export async function placeSolo(page: Page, outcome: string, amount: number): Promise<void> {
  await addToSlip(page, outcome)
  const sheet = await openSlip(page)
  await sheet.getByLabel('Stake (DC)').fill(String(amount))
  await sheet.getByRole('button', { name: `Place 1 bet · ${amount} DC` }).click()
  await expect(page.getByText('Placed 1 solo bet.').first()).toBeVisible()
  await expect(sheet).toHaveCount(0)
}
