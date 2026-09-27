import { describe, it, expect } from 'vitest'
import { FEEDBACK_EMAIL, FEEDBACK_SUBJECT, feedbackHref } from '@/lib/app-shell/feedback'

describe('feedbackHref', () => {
  it('builds a mailto: link to the feedback address with the encoded subject and body', () => {
    const href = feedbackHref('abc123')
    expect(href).toBe(
      `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent('App version: abc123\n\n')}`,
    )
  })

  it('encodes the subject and body so a mail client reads them as separate fields', () => {
    const href = feedbackHref('1.2.3')
    expect(href).toContain('subject=DwellDuel%20beta%20feedback')
    expect(href).toContain('body=App%20version%3A%201.2.3')
  })

  it('falls back to the build-time app version when none is given', () => {
    expect(feedbackHref()).toContain(`body=${encodeURIComponent('App version: unknown\n\n')}`)
  })
})
