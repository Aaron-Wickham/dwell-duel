// Getting started's first step is done once How it works has been opened on this device. A cookie,
// like the card's own dismissal, so Home knows on its first render; it's set from the browser
// because a server component can't set one.
export const HOW_IT_WORKS_READ_COOKIE = 'read-how-it-works'

export function markHowItWorksRead(): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${HOW_IT_WORKS_READ_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`
}
