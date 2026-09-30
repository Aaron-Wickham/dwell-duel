import { describe, expect, it } from 'vitest'
import { ANALYTICS_SAMPLE_RATE, SPEED_INSIGHTS_SAMPLE_RATE, sampleAnalyticsEvent } from '@/lib/app-shell/analytics-sampling'

const event = { type: 'pageview', url: 'https://www.dwellduel.com/markets' } as const

describe('analytics sampling (#278)', () => {
  it('keeps an event when the draw falls under the rate and drops it otherwise', () => {
    expect(sampleAnalyticsEvent(() => ANALYTICS_SAMPLE_RATE - 0.001)(event)).toBe(event)
    expect(sampleAnalyticsEvent(() => ANALYTICS_SAMPLE_RATE)(event)).toBeNull()
  })

  it('stays inside Hobby quotas with half of 1000 members active daily, 25 page views each', () => {
    const monthly = 500 * 25 * 30
    expect(monthly * ANALYTICS_SAMPLE_RATE).toBeLessThanOrEqual(50_000)
    expect(SPEED_INSIGHTS_SAMPLE_RATE).toBeLessThanOrEqual(0.05)
  })
})
