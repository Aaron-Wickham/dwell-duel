import { test, expect } from '@playwright/test'

// The symbol's D and the wordmark's D end on the same line.
async function baselineGap(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const link = ([...document.querySelectorAll('a[aria-label="DwellDuel home"]')] as HTMLElement[]).find(
      (l) => l.getBoundingClientRect().width > 0,
    )!
    const text = link.querySelector('span')!
    // A zero-height inline-block sits on the text's baseline.
    const probe = document.createElement('span')
    probe.style.cssText = 'display:inline-block;width:0;height:0'
    text.prepend(probe)
    const baseline = probe.getBoundingClientRect().bottom
    probe.remove()
    return link.querySelector('svg path.fill-sym-d')!.getBoundingClientRect().bottom - baseline
  })
}

for (const [name, width] of [
  ['phone', 375],
  ['desktop', 1280],
] as const) {
  test(`the top bar's logo D and wordmark D share a baseline on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/markets')
    expect(Math.abs(await baselineGap(page))).toBeLessThanOrEqual(0.5)
  })
}
