import { test, expect } from '@playwright/test'

test('the active tab pill slides to the new tab instead of jumping', async ({ page }) => {
  await page.goto('/bets')
  const tabs = page.getByRole('navigation', { name: 'My bets sections' })
  const pill = tabs.locator('span[aria-hidden="true"]')
  await expect(tabs).toHaveAttribute('data-ready', '')

  const settledLeft = () =>
    tabs.evaluate((nav) => {
      const current = nav.querySelector<HTMLElement>('[aria-current="page"]')!
      return current.offsetLeft
    })

  const before = await settledLeft()
  await pill.evaluate((el) => {
    // The animation is only observable for a moment: count what starts on this element.
    ;(window as unknown as { __slides: number }).__slides = 0
    const originalAnimate = el.animate.bind(el)
    el.animate = (...args: Parameters<Element['animate']>) => {
      ;(window as unknown as { __slides: number }).__slides++
      return originalAnimate(...args)
    }
  })
  await tabs.getByRole('link', { name: 'Settled' }).click()
  await expect(page).toHaveURL(/tab=settled/)
  await expect(tabs.getByRole('link', { name: 'Settled' })).toHaveAttribute('aria-current', 'page')

  await expect.poll(() => pill.evaluate(() => (window as unknown as { __slides: number }).__slides)).toBe(1)
  const after = await settledLeft()
  expect(after).toBeGreaterThan(before)
  await expect.poll(() => pill.evaluate((el) => (el as HTMLElement).offsetLeft)).toBe(after)
})

test('with reduced motion the pill moves without animating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/bets')
  const tabs = page.getByRole('navigation', { name: 'My bets sections' })
  const pill = tabs.locator('span[aria-hidden="true"]')
  await expect(tabs).toHaveAttribute('data-ready', '')
  await pill.evaluate((el) => {
    ;(window as unknown as { __slides: number }).__slides = 0
    el.animate = () => {
      ;(window as unknown as { __slides: number }).__slides++
      return null as unknown as Animation
    }
  })
  await tabs.getByRole('link', { name: 'Settled' }).click()
  await expect(tabs.getByRole('link', { name: 'Settled' })).toHaveAttribute('aria-current', 'page')
  await expect.poll(() => pill.evaluate((el) => (el as HTMLElement).offsetLeft)).toBeGreaterThan(0)
  expect(await pill.evaluate(() => (window as unknown as { __slides: number }).__slides)).toBe(0)
})
