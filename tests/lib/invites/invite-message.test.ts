import { describe, it, expect } from 'vitest'
import { inviteMessage, SIGN_IN_URL } from '@/lib/invites/invite-message'

describe('inviteMessage', () => {
  it('names the app, the production sign-in URL and the Google account to use', () => {
    expect(SIGN_IN_URL).toBe('https://www.dwellduel.com')
    expect(inviteMessage('sam@gmail.com')).toBe(
      "You're invited to DwellDuel, our group's friendly prediction market. Sign in at https://www.dwellduel.com with this Google account: sam@gmail.com",
    )
  })
})
