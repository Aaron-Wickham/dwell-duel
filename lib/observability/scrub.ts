// The slice of a Sentry event this app edits. Kept structural so the scrub is testable without the SDK.
type ScrubbableEvent = {
  user?: unknown
  request?: { url?: string; cookies?: unknown; data?: unknown; headers?: unknown; query_string?: unknown }
  extra?: unknown
}

// Members' emails, cookies (the Supabase session) and form bodies (stakes, notes) never leave for a
// third party: an event keeps its stack and the page path, nothing about who or what they typed.
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user
  delete event.extra
  if (event.request) {
    delete event.request.cookies
    delete event.request.data
    delete event.request.headers
    delete event.request.query_string
    if (event.request.url) event.request.url = event.request.url.split(/[?#]/)[0]
  }
  return event
}
