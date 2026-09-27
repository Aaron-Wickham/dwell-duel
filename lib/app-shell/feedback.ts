export const FEEDBACK_EMAIL = 'aaronmaxwellwickham1917@gmail.com'
export const FEEDBACK_SUBJECT = 'DwellDuel beta feedback'

// `version` defaults to the build-time deploy id next.config.ts's `env` inlines everywhere (see
// components/offline/service-worker-registration.tsx for the same pattern), so a caller only needs
// to pass one explicitly in a test.
export function feedbackHref(version: string = process.env.NEXT_PUBLIC_SW_VERSION ?? 'unknown'): string {
  const subject = encodeURIComponent(FEEDBACK_SUBJECT)
  const body = encodeURIComponent(`App version: ${version}\n\n`)
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`
}
