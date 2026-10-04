import { scrubEvent } from '@/lib/observability/scrub'

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

// The browser skips a view transition when the viewport resizes mid-way (a phone rotating, the
// keyboard opening) or the tab hides. React's <ViewTransition> catches the rejected `ready`, but
// react-dom 19.3 also chains `finished.finally()` with no catch, and that is where the skip escapes
// as an unhandled rejection. The navigation itself completes; only the animation is dropped. These are
// the messages React itself treats as benign, plus Chrome's for a skipped transition.
const SKIPPED_VIEW_TRANSITION = new Set([
  'InvalidStateError: View transition was skipped because document visibility state is hidden.',
  'InvalidStateError: Skipping view transition because document visibility state has become hidden.',
  'InvalidStateError: Skipping view transition because viewport size changed.',
  'InvalidStateError: Transition was aborted because of invalid state',
  'AbortError: Transition was skipped',
])

type FilterableEvent = { message?: string; exception?: { values?: { type?: string; value?: string }[] } }

// A DOMException with a stack arrives as type + value; one without is a synthetic Error whose value
// already reads "Name: message".
export function isSkippedViewTransition(event: FilterableEvent): boolean {
  return (event.exception?.values ?? []).some(
    ({ type, value }) => SKIPPED_VIEW_TRANSITION.has(`${type}: ${value}`) || (value !== undefined && SKIPPED_VIEW_TRANSITION.has(value)),
  )
}

// What the browser reports in place of an error thrown by a cross-origin script (on /sign-in, Google's):
// no message, no stack, nothing to act on (#363). The SDK's own filter for it lives in an integration
// that defaultIntegrations: false leaves out.
const CROSS_ORIGIN_SCRIPT_ERROR = 'Script error.'

export function isCrossOriginScriptError(event: FilterableEvent): boolean {
  return event.message === CROSS_ORIGIN_SCRIPT_ERROR || (event.exception?.values ?? []).some(({ value }) => value === CROSS_ORIGIN_SCRIPT_ERROR)
}

// Errors only: no tracing (an absent tracesSampleRate switches it off, where 0 would keep the span
// machinery running), replay, logs or default PII, so the free tier and the bundle stay small.
export function sentryOptions() {
  return {
    dsn: SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SW_VERSION,
    sendDefaultPii: false,
    beforeSend: <T extends Parameters<typeof scrubEvent>[0] & FilterableEvent>(event: T): T | null =>
      isSkippedViewTransition(event) || isCrossOriginScriptError(event) ? null : scrubEvent(event),
    beforeBreadcrumb: () => null,
  }
}
