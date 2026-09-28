import { test, expect } from '@playwright/test'
import { serverActionSettled } from './server-action'
import { MEMBER_STORAGE_STATE_PATH } from './global-setup'

// Bob submits and the owner approves: nobody reviews their own submission (0046).
test('create a proof-required task, submit it with proof, and approve it as admin', async ({ page, browser }) => {
  const member = await browser.newContext({ storageState: MEMBER_STORAGE_STATE_PATH })
  const bobPage = await member.newPage()
  await bobPage.goto('/')
  // The hero's first "N DC" is the balance; its stat tiles come after it.
  const balance = bobPage.getByRole('region', { name: 'Your balance' }).getByText(/^\d+ DC$/).first()
  const startingBalance = Number((await balance.textContent())!.match(/\d+/)![0])

  await page.goto('/admin/tasks')
  await page.getByLabel('Title').fill('Read Genesis 1-3')
  await page.getByLabel('Reward (DC)').fill('10')
  await page.getByLabel('Require proof').check()
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Read Genesis 1-3 — 10 DC')).toBeVisible()

  await bobPage.goto('/tasks')
  const row = bobPage.getByRole('listitem').filter({ hasText: 'Read Genesis 1-3' })
  await expect(row.getByText('Read Genesis 1-3 — 10 DC')).toBeVisible()
  await expect(row.getByText('Proof required')).toBeVisible()
  await row.getByRole('button', { name: /I did this/ }).click()
  const dialog = bobPage.getByRole('dialog', { name: 'Submit “Read Genesis 1-3”' })
  // A proof-required task can't go without proof.
  await dialog.getByRole('button', { name: 'Submit for review' }).click()
  await expect(dialog.getByText('This task needs proof: add a photo, file or link.')).toBeVisible()

  await dialog.getByLabel('Note (optional)').fill('Read it with my small group')
  await dialog.getByLabel('Link').fill('https://example.com/genesis-notes')
  await dialog.getByRole('button', { name: 'Add link' }).click()
  const submitted = serverActionSettled(bobPage)
  await dialog.getByRole('button', { name: 'Submit for review' }).click()
  await expect(row.getByText('Pending review')).toBeVisible()
  await submitted
  await expect(row.getByText('Sent with 1 attachment')).toBeVisible()

  await page.goto('/admin/tasks')
  const pending = page.getByRole('listitem').filter({ hasText: 'Read Genesis 1-3' })
  await expect(pending.getByText('“Read it with my small group”')).toBeVisible()
  await expect(pending.getByRole('link', { name: 'example.com/genesis-notes' })).toBeVisible()
  await pending.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Nothing pending.')).toBeVisible()

  await bobPage.goto('/')
  await expect(balance).toHaveText(`${startingBalance + 10} DC`)
  await member.close()
})
