import type { Page } from '@playwright/test'

// Resolves once the next server action has answered. Optimistic rows show the result before the
// server has it, and navigating away straight after would abort the request, so a spec that
// leaves the page after one waits for this first.
//
// Tried waiting past `finished()` too (the full response body, not just its headers), on the
// theory that the "destination stream closed early" server log lines came from a `page.goto`
// aborting a still-streaming body. That change made `admin-controls.spec.ts` hang: its very
// first `await submitted` never resolved even 60s in (reproduced twice, in the full suite and
// alone), while the button's own optimistic assertion passed immediately. `response.finished()`
// depends on the underlying connection reporting completion, and this app's kept-alive
// connections apparently don't signal that promptly for a Server Action POST, so the wait is
// unsafe here. Back to resolving on the response object as soon as its headers are seen.
export function serverActionSettled(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.request().headers()['next-action'] !== undefined,
  )
}
