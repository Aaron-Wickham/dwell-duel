export const VAPID_SUBJECT = 'https://www.dwellduel.com'

export interface VapidKeys {
  publicKey: string
  privateKey: string
}

// Both keys or neither: without them (local dev, CI, tests) sending is a no-op and Settings says
// notifications aren't available here.
export function vapidKeys(env: Record<string, string | undefined> = process.env): VapidKeys | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  return publicKey && privateKey ? { publicKey, privateKey } : null
}
