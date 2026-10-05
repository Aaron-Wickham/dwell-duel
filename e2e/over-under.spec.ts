import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('create an over/under, reword it, and resolve it from the actual number', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Minutes the sermon runs')
  await page.getByLabel('Over/Under').check()
  await page.getByLabel('Line').fill('42.5')
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()

  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  const outcomes = page.getByRole('region', { name: 'Outcomes' })
  await expect(outcomes.getByRole('listitem')).toHaveText([/^Over 42\.5/, /^Under 42\.5/])
  await expect(page.getByRole('region', { name: 'Over 42.5 over time' })).toBeVisible()

  const moreActions = page.getByRole('button', { name: 'More actions' })
  await moreActions.click()
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit market' })
  await dialog.getByLabel('Title').fill('Minutes the Sunday sermon runs')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Minutes the Sunday sermon runs' })).toBeVisible()
  await moreActions.click()
  await page.getByRole('menuitem', { name: 'Edit history' }).click()
  const history = page.getByRole('dialog', { name: 'Edit history' })
  await expect(history.getByText('“Minutes the sermon runs”')).toBeVisible()
  await history.getByRole('button', { name: 'Close' }).click()
  await expect(history).toHaveCount(0)

  await page.getByLabel('Actual result').fill('47')
  await expect(page.getByText('Over 42.5 wins.')).toBeVisible()
  await page.getByLabel('Why did this outcome win?').fill('Timed it from the livestream')
  await page.getByRole('button', { name: 'Resolve market' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Resolve this market?' })).toContainText('Over 42.5 wins.')
  await page.getByRole('button', { name: /^(Resolve as|Change to) / }).click()

  await expect(outcomes.getByText('Over 42.5 won', { exact: true })).toBeVisible()
  await expect(outcomes.getByText('Actual: 47', { exact: true })).toBeVisible()
})
