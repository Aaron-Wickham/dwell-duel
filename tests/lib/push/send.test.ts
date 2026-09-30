import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { sendNotification, serviceRoleClient } = vi.hoisted(() => ({ sendNotification: vi.fn(), serviceRoleClient: vi.fn() }))
vi.mock('web-push', () => ({ default: { sendNotification } }))
vi.mock('@/lib/supabase/service-role', () => ({ serviceRoleClient }))

import { sendPush } from '@/lib/push/send'
import type { DbClient } from '@/lib/supabase/database'

type Sub = { id: string; profile_id: string; endpoint: string; p256dh: string; auth: string }

function fakeDb(subscriptions: Sub[]) {
  const deleted: string[] = []
  const touched: string[] = []
  const failures: string[] = []
  const db = {
    rpc: async (name: string, args: { p_delivered: string[]; p_failed: string[] }) => {
      expect(name).toBe('record_push_results')
      touched.push(...args.p_delivered)
      failures.push(...args.p_failed)
      return { error: null }
    },
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => ({ data: subscriptions.filter((s) => ids.includes(s.profile_id)), error: null }),
      }),
      delete: () => ({
        in: async (_col: string, ids: string[]) => {
          deleted.push(...ids)
          return { error: null }
        },
      }),
    }),
  }
  return { db: db as unknown as DbClient, deleted, touched, failures }
}

const sub = (id: string, profile: string): Sub => ({
  id,
  profile_id: profile,
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  p256dh: `key-${id}`,
  auth: `auth-${id}`,
})

const payload = { title: 'DwellDuel', body: 'You won 26 DC on Will it rain?', url: '/markets/m-1' }

beforeEach(() => {
  sendNotification.mockReset().mockResolvedValue({ statusCode: 201 })
  serviceRoleClient.mockReset()
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sendPush', () => {
  it('is a no-op without the VAPID keys', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const { db } = fakeDb([sub('s1', 'alice')])
    expect(await sendPush([{ profileId: 'alice', payload }], db)).toEqual({ sent: 0, removed: 0, failed: 0, systemic: 0, credentials: 0 })
    expect(sendNotification).not.toHaveBeenCalled()
    expect(serviceRoleClient).not.toHaveBeenCalled()
  })

  it("sends to each of a member's devices, and only theirs, with the VAPID details", async () => {
    const { db, touched } = fakeDb([sub('s1', 'alice'), sub('s2', 'alice'), sub('s3', 'bob')])
    const result = await sendPush([{ profileId: 'alice', payload }], db)

    expect(result).toEqual({ sent: 2, removed: 0, failed: 0, systemic: 0, credentials: 0 })
    expect(sendNotification).toHaveBeenCalledTimes(2)
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/s1', keys: { p256dh: 'key-s1', auth: 'auth-s1' } },
      JSON.stringify(payload),
      expect.objectContaining({
        vapidDetails: { subject: 'https://www.dwellduel.com', publicKey: 'public-key', privateKey: 'private-key' },
      }),
    )
    expect(touched.sort()).toEqual(['s1', 's2'])
  })

  it('deletes subscriptions the push service says are gone (404 and 410)', async () => {
    const { db, deleted, touched } = fakeDb([sub('s1', 'alice'), sub('s2', 'alice'), sub('s3', 'alice')])
    sendNotification.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      if (endpoint.endsWith('s1')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
      if (endpoint.endsWith('s2')) throw Object.assign(new Error('Not found'), { statusCode: 404 })
      return { statusCode: 201 }
    })

    expect(await sendPush([{ profileId: 'alice', payload }], db)).toEqual({ sent: 1, removed: 2, failed: 0, systemic: 0, credentials: 0 })
    expect(deleted.sort()).toEqual(['s1', 's2'])
    expect(touched).toEqual(['s3'])
  })

  it('keeps a subscription after a failure that is not its fault, logging it instead of throwing', async () => {
    const { db, deleted, failures } = fakeDb([sub('s1', 'alice')])
    sendNotification.mockRejectedValue(Object.assign(new Error('Too many'), { statusCode: 429 }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await sendPush([{ profileId: 'alice', payload }], db)).toEqual({ sent: 0, removed: 0, failed: 1, systemic: 1, credentials: 0 })
    expect(deleted).toEqual([])
    // A 429 is the push service's doing, so it is reported but never counted against the device.
    expect(failures).toEqual([])
    expect(log).toHaveBeenCalled()
  })

  it('counts a failure against a device only for a 4xx it caused, never a 401/403 (our VAPID keys), 429, 5xx or no status (#257)', async () => {
    const { db, failures, deleted } = fakeDb([sub('s400', 'alice'), sub('s403', 'alice'), sub('s413', 'alice'), sub('s429', 'alice'), sub('s503', 'alice'), sub('snone', 'alice')])
    const statuses: Record<string, number | undefined> = { s400: 400, s403: 403, s413: 413, s429: 429, s503: 503, snone: undefined }
    sendNotification.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      throw Object.assign(new Error('nope'), { statusCode: statuses[endpoint.split('/').pop()!] })
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await sendPush([{ profileId: 'alice', payload }], db)).toEqual({ sent: 0, removed: 0, failed: 6, systemic: 4, credentials: 0 })
    expect(failures.sort()).toEqual(['s400', 's413'])
    expect(deleted).toEqual([])
  })

  it('records a one-device VAPID rejection (403) as systemic and never against the device', async () => {
    const { db, failures, deleted } = fakeDb([sub('s1', 'alice')])
    sendNotification.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await sendPush([{ profileId: 'alice', payload }], db)).toEqual({ sent: 0, removed: 0, failed: 1, systemic: 1, credentials: 0 })
    expect(failures).toEqual([])
    expect(deleted).toEqual([])
  })

  it('records a 403 against its device when the same call delivered elsewhere (our credentials work)', async () => {
    const { db, failures } = fakeDb([sub('s1', 'alice'), sub('s2', 'alice')])
    sendNotification.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      if (endpoint.endsWith('s2')) throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      return { statusCode: 201 }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await sendPush([{ profileId: 'alice', payload }], db)).toEqual({ sent: 1, removed: 0, failed: 1, systemic: 0, credentials: 0 })
    expect(failures).toEqual(['s2'])
  })

  it('holds 401/403 answers for the run to judge when given one', async () => {
    const { db, failures } = fakeDb([sub('s1', 'alice')])
    sendNotification.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 401 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = { credentialIds: [] as string[], credentialCount: 0, credentialMarkets: [] }
    expect(await sendPush([{ profileId: 'alice', payload }], db, run)).toEqual({ sent: 0, removed: 0, failed: 1, systemic: 0, credentials: 1 })
    expect(run).toMatchObject({ credentialIds: ['s1'], credentialCount: 1 })
    expect(failures).toEqual([])
  })

  it('never POSTs to an endpoint that isn’t a push service, whatever the table holds (#201)', async () => {
    const evil = { ...sub('s2', 'alice'), endpoint: 'https://evil.example.com/collect' }
    const { db, deleted, touched } = fakeDb([sub('s1', 'alice'), evil])
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await sendPush([{ profileId: 'alice', payload }], db)).toEqual({ sent: 1, removed: 0, failed: 0, systemic: 0, credentials: 0 })
    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(sendNotification.mock.calls[0][0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/s1')
    expect(deleted).toEqual([])
    expect(touched).toEqual(['s1'])
    expect(log).toHaveBeenCalledWith('Skipping push subscriptions with non-push endpoints', ['s2'])
  })

  it('never throws when reading subscriptions fails', async () => {
    const db = {
      from: () => ({ select: () => ({ in: async () => ({ data: null, error: new Error('db down') }) }) }),
    } as unknown as DbClient
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendPush([{ profileId: 'alice', payload }], db)).resolves.toEqual({ sent: 0, removed: 0, failed: 1, systemic: 1, credentials: 0 })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends no more than six at once', async () => {
    const subs = Array.from({ length: 20 }, (_, i) => sub(`s${i}`, 'alice'))
    const { db } = fakeDb(subs)
    let inFlight = 0
    let peak = 0
    sendNotification.mockImplementation(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight--
      return { statusCode: 201 }
    })

    expect((await sendPush([{ profileId: 'alice', payload }], db)).sent).toBe(20)
    expect(peak).toBe(6)
  })
})
