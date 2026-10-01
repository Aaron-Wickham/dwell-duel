// The slice of a Sentry event this app edits. Kept structural so the scrub is testable without the SDK.
type ScrubbableEvent = {
  user?: unknown
  request?: { url?: string; cookies?: unknown; data?: unknown; headers?: unknown; query_string?: unknown }
  extra?: unknown
  breadcrumbs?: unknown
  contexts?: { nextjs?: { request_path?: string } & Record<string, unknown> } & Record<string, unknown>
}

const withoutQuery = (url: string) => url.split(/[?#]/)[0]

// Members' emails, cookies (the Supabase session), form bodies (stakes, notes) and query strings
// (auth codes, Supabase filters) never leave for a third party: an event keeps its stack and the
// page path, nothing about who or what they typed. Breadcrumbs go entirely: console ones carry raw
// error objects (a PostgREST `details` can quote member input) and fetch ones carry query strings.
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user
  delete event.extra
  delete event.breadcrumbs
  if (event.request) {
    delete event.request.cookies
    delete event.request.data
    delete event.request.headers
    delete event.request.query_string
    if (event.request.url) event.request.url = withoutQuery(event.request.url)
  }
  // captureRequestError stores Next's request path, which includes the query (/callback?code=...).
  const nextjs = event.contexts?.nextjs
  if (nextjs?.request_path) nextjs.request_path = withoutQuery(nextjs.request_path)
  return event
}
