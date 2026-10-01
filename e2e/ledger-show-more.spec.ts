import { test, expect, type Request } from '@playwright/test'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// Next fetches a link's loading state ahead of time (a prefetch, marked Next-Router-Prefetch), and
// fetches the page itself on click (RSC, no prefetch header). Holding only the second one shows
// what the page does while the next range is on its way.
function isPageFetch(request: Request) {
  const headers = request.headers()
  return headers['rsc'] === '1' && !('next-router-prefetch' in headers)
}

test('Show more on the admin ledger appends older rows in place, and a reload keeps them', async ({ page }) => {
  const { data: alice, error } = await serviceClient().from('profiles').select('id, email').eq('display_name', 'Alice').single()
  if (error) throw error
  const aliceClient = await clientForEmail(alice.email)
  // Sixty real ledger rows, +1 and −1 in turn, so Alice's balance nets back to where it started.
  for (let i = 0; i < 60; i++) {
    const { error: adjustErr } = await aliceClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: i % 2 === 0 ? 1 : -1,
      p_reason: `Paging check ${String(i).padStart(2, '0')}`,
    })
    if (adjustErr) throw adjustErr
  }

  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let intercepted = false
  await page.route(
    (url) => url.pathname === '/admin/ledger' && url.searchParams.has('before'),
    async (route) => {
      if (isPageFetch(route.request())) {
        intercepted = true
        await held
      }
      await route.continue()
    },
  )

  await page.goto('/admin/ledger')
  const ledger = page.getByRole('region', { name: 'Every coin movement' })
  const row = (n: string) => ledger.getByRole('listitem').filter({ hasText: `Paging check ${n}` })
  // The newest 50 are checks 59 down to 10.
  await expect(row('10')).toBeVisible()
  await expect(row('09')).toHaveCount(0)

  const showMore = ledger.getByRole('link', { name: 'Show more' })
  await showMore.scrollIntoViewIfNeeded()
  // The page fades in through a view transition; while it runs the root element covers the page, so
  // a click is not delivered, and Playwright retries it after scrolling the link to another
  // alignment. That moves the page the test is about to measure, so wait until the link can be hit.
  await expect
    .poll(() =>
      showMore.evaluate((el) => {
        const { left, top, width, height } = el.getBoundingClientRect()
        return document.elementFromPoint(left + width / 2, top + height / 2) === el
      }),
    )
    .toBe(true)
  const scrollBefore = await page.evaluate(() => window.scrollY)
  expect(scrollBefore).toBeGreaterThan(0)
  // Flags the route's loading skeleton if it mounts at any point, even for one frame.
  await page.evaluate(() => {
    const flags = window as unknown as { skeletonShown: boolean }
    flags.skeletonShown = false
    new MutationObserver(() => {
      if (document.querySelector('[data-skeleton]')) flags.skeletonShown = true
    }).observe(document.body, { childList: true, subtree: true })
  })

  await showMore.click()
  await expect.poll(() => intercepted).toBe(true)
  // While the next range loads, the first page stays on screen, where it was.
  await expect(row('10')).toBeVisible()
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1)
  release()

  await expect(row('09')).toBeVisible()
  await expect(page).toHaveURL(/[?&]before=/)
  const [last, older] = await Promise.all([row('10').boundingBox(), row('09').boundingBox()])
  expect(older!.y).toBeGreaterThan(last!.y)
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => (window as unknown as { skeletonShown: boolean }).skeletonShown)).toBe(false)
  await page.unrouteAll()

  await page.reload()
  await expect(row('10')).toBeVisible()
  await expect(row('09')).toBeVisible()
  await expect(row('00')).toBeVisible()
})
