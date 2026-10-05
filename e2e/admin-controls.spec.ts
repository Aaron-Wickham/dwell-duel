import { test, expect } from '@playwright/test'
import { serverActionSettled } from './server-action'
import { MEMBER_STORAGE_STATE_PATH } from './global-setup'

test('bulk-approve two pending task completions from the admin queue', async ({ page, browser }) => {
  await page.goto('/admin/tasks')
  await page.getByLabel('Title').fill('Read Psalm 23')
  await page.getByLabel('Reward (DC)').fill('5')
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Read Psalm 23 — 5 DC')).toBeVisible()

  await page.getByLabel('Title').fill('Read Proverbs 3')
  await page.getByLabel('Reward (DC)').fill('7')
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Read Proverbs 3 — 7 DC')).toBeVisible()

  // Bob submits: nobody reviews their own submission (0046), so the owner reviews his.
  const member = await browser.newContext({ storageState: MEMBER_STORAGE_STATE_PATH })
  const bobPage = await member.newPage()
  await bobPage.goto('/tasks')
  for (const title of ['Read Psalm 23', 'Read Proverbs 3']) {
    const row = bobPage.getByRole('listitem').filter({ hasText: title })
    const submitted = serverActionSettled(bobPage)
    await row.getByRole('button', { name: /I did this/ }).click()
    await bobPage.getByRole('dialog').getByRole('button', { name: 'Submit for review' }).click()
    await submitted
    // The row moves to Waiting for review (#394).
    await expect(bobPage.getByRole('region', { name: 'Waiting for review' }).getByText(title)).toBeVisible()
  }
  await member.close()

  await page.goto('/admin/tasks')
  await page.locator('input[name="completionIds"]').first().check()
  await page.locator('input[name="completionIds"]').nth(1).check()
  await page.getByRole('button', { name: 'Approve selected' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve and pay' }).click()

  await expect(page.getByText('2 approved.')).toBeVisible()
  await expect(page.getByText('No tasks to review.')).toBeVisible()
})
