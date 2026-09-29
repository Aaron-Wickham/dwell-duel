// The push services of the browsers that support web push: Chrome and other Chromium browsers
// (FCM), Firefox, Safari and Edge. The server POSTs to a saved endpoint, so it must never be free
// to name any URL at all.
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com']

export const SUBSCRIPTION_LIMITS = { endpoint: 1024, p256dh: 128, auth: 64, userAgent: 512 } as const

export interface SubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
}

export function isPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
}

export function validSubscription(input: unknown): SubscriptionInput | null {
  if (!input || typeof input !== 'object') return null
  const { endpoint, p256dh, auth } = input as Record<string, unknown>
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') return null
  if (endpoint.length > SUBSCRIPTION_LIMITS.endpoint || !isPushEndpoint(endpoint)) return null
  if (!p256dh || p256dh.length > SUBSCRIPTION_LIMITS.p256dh) return null
  if (!auth || auth.length > SUBSCRIPTION_LIMITS.auth) return null
  return { endpoint, p256dh, auth }
}
