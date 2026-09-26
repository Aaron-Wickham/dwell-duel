import type { Page } from '@playwright/test'

// Resolves once the next server action has answered. Optimistic rows show the result before the
// server has it, and navigating away straight after would abort the request, so a spec that
// leaves the page after one waits for this first.
//
// Resolves on the response headers: by then the action has committed; waiting for the body hangs
// specs whose next navigation aborts the stream.
export function serverActionSettled(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.request().headers()['next-action'] !== undefined,
  )
}
