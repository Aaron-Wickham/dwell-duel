import { test, expect } from '@playwright/test'

test('bulk-approve two pending task completions from the admin queue', async ({ page }) => {
  await page.goto('/admin/tasks')
  await page.getByLabel('Title').fill('Read Psalm 23')
  await page.getByLabel('Reward (DC)').fill('5')
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Read Psalm 23 — 5 DC')).toBeVisible()

  await page.getByLabel('Title').fill('Read Proverbs 3')
  await page.getByLabel('Reward (DC)').fill('7')
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Read Proverbs 3 — 7 DC')).toBeVisible()

  await page.goto('/tasks')
  await page.getByRole('button', { name: 'I did this' }).first().click()
  await expect(page.getByText('Pending review').first()).toBeVisible()
  await page.getByRole('button', { name: 'I did this' }).first().click()

  await page.goto('/admin/tasks')
  await page.locator('input[name="completionIds"]').first().check()
  await page.locator('input[name="completionIds"]').nth(1).check()
  await page.getByRole('button', { name: 'Approve selected' }).click()

  await expect(page.getByText('2 approved.')).toBeVisible()
  await expect(page.getByText('Nothing pending.')).toBeVisible()
})
