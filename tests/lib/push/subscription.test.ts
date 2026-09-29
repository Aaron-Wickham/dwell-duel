import { describe, it, expect } from 'vitest'
import { isPushEndpoint, validSubscription } from '@/lib/push/subscription'

describe('isPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QABC',
    'https://wns2-bl2p.notify.windows.com/w/?token=abc',
  ])('accepts %s', (url) => {
    expect(isPushEndpoint(url)).toBe(true)
  })

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://evil.example.com/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'https://localhost/x',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isPushEndpoint(url)).toBe(false)
  })
})

describe('validSubscription', () => {
  const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'BPk', auth: 'xyz' }

  it('passes a well-formed subscription through', () => {
    expect(validSubscription(good)).toEqual(good)
  })

  it('refuses missing or oversized keys', () => {
    expect(validSubscription(null)).toBeNull()
    expect(validSubscription({ ...good, auth: '' })).toBeNull()
    expect(validSubscription({ ...good, p256dh: undefined })).toBeNull()
    expect(validSubscription({ ...good, p256dh: 'a'.repeat(129) })).toBeNull()
    expect(validSubscription({ ...good, endpoint: `https://fcm.googleapis.com/${'a'.repeat(1024)}` })).toBeNull()
  })
})
