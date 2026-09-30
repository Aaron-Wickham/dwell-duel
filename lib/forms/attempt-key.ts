import { useState } from 'react'

// A key for one attempt at an action that creates something (#61, #258). Next replays an action
// whose response was lost, and a member may tap again; both send the same key, so the server does
// the work once. The key is tied to what was submitted: editing the form after a lost response
// starts a new attempt instead of quietly replaying the first one (#267).
export function useAttemptKey() {
  // Created once, so the object handed out is stable and its held key outlives renders.
  const [api] = useState(() => {
    let held: { key: string; fingerprint: string } | null = null
    return {
      claim(fingerprint: string): string {
        if (!held || held.fingerprint !== fingerprint) held = { key: crypto.randomUUID(), fingerprint }
        return held.key
      },
      // Call once the action has succeeded, so the next submission is a new attempt.
      release() {
        held = null
      },
    }
  })
  return api
}

// What a submission says, as a string, for `claim`. Files aren't compared; none of these forms send one.
export function fingerprintOf(formData: FormData): string {
  return JSON.stringify([...formData.entries()].filter(([, value]) => typeof value === 'string'))
}
