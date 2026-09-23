import { test, expect } from '@playwright/test'

test('create a task, submit it, and approve it as admin', async ({ page }) => {
  await page.goto('/admin/tasks')

  await page.getByLabel('Title').fill('Read Genesis 1-3')
  await page.getByLabel('Reward (DC)').fill('10')
  await page.getByRole('button', { name: 'Create task' }).click()

  await expect(page.getByText('Read Genesis 1-3 — 10 DC')).toBeVisible()

  await page.goto('/tasks')
  await expect(page.getByText('Read Genesis 1-3 — 10 DC')).toBeVisible()
  await page.getByRole('button', { name: 'I did this' }).click()
  await expect(page.getByText('Pending review')).toBeVisible()

  await page.goto('/admin/tasks')
  await expect(page.getByText('Read Genesis 1-3').first()).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await expect(page.getByText('Nothing pending.')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('Balance: 110 DC')).toBeVisible()
})
