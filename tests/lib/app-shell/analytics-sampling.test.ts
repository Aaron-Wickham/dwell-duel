import { describe, expect, it } from 'vitest'
import { ANALYTICS_SAMPLE_RATE, SPEED_INSIGHTS_SAMPLE_RATE, sampleAnalyticsEvent } from '@/lib/app-shell/analytics-sampling'

const event = { type: 'pageview', url: 'https://www.dwellduel.com/markets' } as const

describe('analytics sampling (#278)', () => {
  it('keeps an event when the draw falls under the rate and drops it otherwise', () => {
    expect(sampleAnalyticsEvent(() => ANALYTICS_SAMPLE_RATE - 0.001)(event)).toBe(event)
    expect(sampleAnalyticsEvent(() => ANALYTICS_SAMPLE_RATE)(event)).toBeNull()
  })

  it('keeps Analytics events inside the Hobby 50k/month cap at the assumed traffic', () => {
    // Assumption: 500 of 1000 members active daily, 25 page views each.
    const monthly = 500 * 25 * 30
    expect(monthly * ANALYTICS_SAMPLE_RATE).toBeLessThanOrEqual(50_000)
  })

  it('keeps Speed Insights data points inside the Hobby 10k/30 days cap at the assumed traffic', () => {
    // Assumption: one full page load per active member per day (vitals report on load, not on
    // client-side navigations), about 5 data points each (LCP, FCP, CLS, INP, TTFB).
    const monthly = 500 * 30 * 5
    expect(monthly * SPEED_INSIGHTS_SAMPLE_RATE).toBeLessThanOrEqual(10_000)
  })
})
