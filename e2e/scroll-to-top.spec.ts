import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

// Every page is made tall, so a short page can't pass by clamping the scroll to 0. The style tag
// lives in <head>, which a client navigation keeps.
async function makeTall(page: Page) {
  await page.addStyleTag({ content: 'main { min-height: 4000px !important; }' })
}

async function scrollTo(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo(0, top), y)
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(y)
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY))

test('a new page opens at its top, even from a page scrolled only a little (#349)', async ({ page }) => {
  await page.goto('/markets')
  await makeTall(page)
  // Next scrolls only when the new page starts off screen; 40px leaves it on screen.
  await scrollTo(page, 40)
  await page.getByRole('navigation', { name: 'Primary' }).last().getByRole('link', { name: 'Bets' }).click()
  await expect(page).toHaveURL(/\/bets$/)
  await expect.poll(() => scrollY(page)).toBe(0)

  await scrollTo(page, 900)
  await page.getByRole('navigation', { name: 'Primary' }).last().getByRole('link', { name: 'Tasks' }).click()
  await expect(page).toHaveURL(/\/tasks$/)
  await expect.poll(() => scrollY(page)).toBe(0)
})

test('an admin section opens at the top of the page, not under the shared header (#349)', async ({ page }) => {
  await page.goto('/admin/invites')
  await makeTall(page)
  await scrollTo(page, 100)
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: /^Markets/ }).click()
  await expect(page).toHaveURL(/\/admin\/markets$/)
  await expect.poll(() => scrollY(page)).toBe(0)
})

test('going back returns to where the member was', async ({ page }) => {
  await page.goto('/markets')
  await makeTall(page)
  await scrollTo(page, 600)
  await page.getByRole('navigation', { name: 'Primary' }).last().getByRole('link', { name: 'Bets' }).click()
  await expect(page).toHaveURL(/\/bets$/)
  await expect.poll(() => scrollY(page)).toBe(0)

  await page.goBack()
  await expect(page).toHaveURL(/\/markets$/)
  await expect.poll(() => scrollY(page)).toBe(600)
})
