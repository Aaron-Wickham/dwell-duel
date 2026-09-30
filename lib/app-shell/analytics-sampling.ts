import type { BeforeSend } from '@vercel/analytics/next'

// Hobby allows 50,000 Web Analytics events a month and 10,000 Speed Insights events over 30 days,
// and every client-side navigation is a page view: unsampled, 300 daily members use the first up
// in about a week (#278). At these rates 500 of 1000 members active daily stay inside both.
export const ANALYTICS_SAMPLE_RATE = 0.1
export const SPEED_INSIGHTS_SAMPLE_RATE = 0.05

export function sampleAnalyticsEvent(random: () => number = Math.random): BeforeSend {
  return (event) => (random() < ANALYTICS_SAMPLE_RATE ? event : null)
}
