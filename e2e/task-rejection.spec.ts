import { test, expect } from '@playwright/test'
import { serverActionSettled } from './server-action'
import { MEMBER_STORAGE_STATE_PATH } from './global-setup'

// Bob submits and the owner rejects: nobody reviews their own submission (0046).
test('reject a task submission with a reason the member then sees', async ({ page, browser }) => {
  const title = 'Memorise John 3:16'
  await page.goto('/admin/tasks')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Reward (DC)').fill('8')
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText(`${title} — 8 DC`)).toBeVisible()

  const member = await browser.newContext({ storageState: MEMBER_STORAGE_STATE_PATH })
  const bobPage = await member.newPage()
  await bobPage.goto('/')
  const balance = bobPage.getByRole('region', { name: 'Balance' }).getByText(/^[\d,]+ DC$/).first()
  const startingBalance = await balance.textContent()

  await bobPage.goto('/tasks')
  // Tasks groups rows by state (#394), so the row moves from To do to Waiting for review.
  const group = (name: string) => bobPage.getByRole('region', { name }).getByRole('listitem').filter({ hasText: title })
  const submitted = serverActionSettled(bobPage)
  await group('To do').getByRole('button', { name: /I did this/ }).click()
  await bobPage.getByRole('dialog').getByRole('button', { name: 'Submit for review' }).click()
  await submitted
  await expect(group('Waiting for review')).toBeVisible()

  await page.goto('/admin/tasks')
  const pending = page.getByRole('listitem').filter({ hasText: title })
  await pending.getByLabel('Reason for rejecting (optional)').fill('Say it to your small group leader first')
  await pending.getByRole('button', { name: `Reject Bob’s ${title}` }).click()
  await expect(page.getByText('Submission rejected.').first()).toBeVisible()
  await expect(page.getByText('Nothing pending.')).toBeVisible()

  await bobPage.goto('/tasks')
  const rejected = group('Not approved')
  await expect(rejected.getByText('“Say it to your small group leader first”')).toBeVisible()
  // A rejected task can be tried again, and paid nothing.
  await expect(rejected.getByRole('button', { name: /Try again/ })).toBeVisible()
  await bobPage.goto('/')
  await expect(balance).toHaveText(startingBalance!)
  await member.close()
})
