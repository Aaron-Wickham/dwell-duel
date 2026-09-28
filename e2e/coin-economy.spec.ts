import { test, expect } from '@playwright/test'
import { serverActionSettled } from './server-action'

test('create a proof-required task, submit it with proof, and approve it as admin', async ({ page }) => {
  await page.goto('/')
  const balanceText = await page.getByText(/Balance: \d+ DC/).textContent()
  const startingBalance = Number(balanceText!.match(/\d+/)![0])

  await page.goto('/admin/tasks')

  await page.getByLabel('Title').fill('Read Genesis 1-3')
  await page.getByLabel('Reward (DC)').fill('10')
  await page.getByLabel('Require proof').check()
  await page.getByRole('button', { name: 'Create task' }).click()

  await expect(page.getByText('Read Genesis 1-3 — 10 DC')).toBeVisible()

  await page.goto('/tasks')
  await expect(page.getByText('Read Genesis 1-3 — 10 DC')).toBeVisible()
  await expect(page.getByText('Proof required')).toBeVisible()
  await page.getByRole('button', { name: 'I did this' }).click()
  const dialog = page.getByRole('dialog', { name: 'Submit “Read Genesis 1-3”' })
  // A proof-required task can't go without proof.
  await dialog.getByRole('button', { name: 'Submit for review' }).click()
  await expect(dialog.getByText('This task needs proof: add a photo, file or link.')).toBeVisible()

  await dialog.getByLabel('Note (optional)').fill('Read it with my small group')
  await dialog.getByLabel('Link').fill('https://example.com/genesis-notes')
  await dialog.getByRole('button', { name: 'Add link' }).click()
  const submitted = serverActionSettled(page)
  await dialog.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Pending review')).toBeVisible()
  await submitted
  await expect(page.getByText('Sent with 1 attachment')).toBeVisible()

  await page.goto('/admin/tasks')
  await expect(page.getByText('Read Genesis 1-3').first()).toBeVisible()
  await expect(page.getByText('“Read it with my small group”')).toBeVisible()
  await expect(page.getByRole('link', { name: 'example.com/genesis-notes' })).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await expect(page.getByText('Nothing pending.')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText(`Balance: ${startingBalance + 10} DC`)).toBeVisible()
})
