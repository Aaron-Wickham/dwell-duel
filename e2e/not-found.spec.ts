import { test, expect } from '@playwright/test'

test('an unknown URL shows a 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Page not found')).toBeVisible()
})
