'use client'

import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { SPEED_INSIGHTS_SAMPLE_RATE, sampleAnalyticsEvent } from '@/lib/app-shell/analytics-sampling'

const beforeSend = sampleAnalyticsEvent()

// A client component because `beforeSend` is a function, which can't cross from the root layout.
export function VercelMetrics() {
  return (
    <>
      <Analytics beforeSend={beforeSend} />
      <SpeedInsights sampleRate={SPEED_INSIGHTS_SAMPLE_RATE} />
    </>
  )
}
