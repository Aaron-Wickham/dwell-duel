import { test, expect } from '@playwright/test'

test('an empty slip shows its empty state and a way to markets', async ({ page }) => {
  await page.goto('/parlays')
  await expect(page.getByText('Your slip is empty.')).toBeVisible()
  await expect(page.getByText('Add picks from any open market.')).toBeVisible()

  await page.getByRole('link', { name: 'Browse markets' }).click()
  await expect(page).toHaveURL(/\/markets$/)
})
