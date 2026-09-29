// Always production: an admin inviting from a preview deploy or localhost still sends friends to the real app.
export const SIGN_IN_URL = 'https://www.dwellduel.com'

export function inviteMessage(email: string): string {
  return `You're invited to DwellDuel, our group's friendly prediction market. Sign in at ${SIGN_IN_URL} with this Google account: ${email}`
}
