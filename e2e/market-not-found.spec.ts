import { test, expect } from '@playwright/test'

test('an unknown or malformed market id gets a real 404 and the not-found page', async ({ page }) => {
  for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
    const response = await page.goto(`/markets/${id}`)
    expect(response?.status(), id).toBe(404)
    // A soft 404 would have streamed a skeleton into the document before the not-found page.
    expect(await response?.text(), id).not.toContain('data-skeleton')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  }
})
