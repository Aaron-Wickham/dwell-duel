import { test, expect } from '@playwright/test'

test('signed-in member sees their name and starting balance', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Alice', { exact: false })).toBeVisible()
  await expect(page.getByText('100', { exact: false })).toBeVisible()
})

test('admin can add and revoke an invite', async ({ page }) => {
  await page.goto('/admin/invites')
  await page.getByPlaceholder('friend@gmail.com').fill('newperson@example.com')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('newperson@example.com')).toBeVisible()

  await page.getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByText('newperson@example.com')).not.toBeVisible()
})

test('sign-out returns to the sign-in page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
})
