import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'

// #384: a page visited in the last 30s comes back from the client router's cache, so a tab switch
// is instant. LiveRefresh's router.refresh() and every revalidating action still clear it.
describe('the client router cache', () => {
  it('keeps dynamic pages for 30 seconds', () => {
    expect(nextConfig.experimental?.staleTimes).toEqual({ dynamic: 30 })
  })
})
