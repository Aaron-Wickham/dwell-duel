import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, anonClient, ensureInvited, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient
// A name of its own per test, since nothing clears cron_heartbeats between tests.
let job: string

async function setRole(m: Member, role: 'member' | 'reviewer' | 'admin' | 'owner'): Promise<void> {
  await giveRole(m, role)
}

async function readAs(client: TestClient): Promise<{ name: string; last_run_at: string }[]> {
  const { data, error } = await client.from('cron_heartbeats').select('name, last_run_at').eq('name', job)
  if (error) throw error
  return data
}

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [aliceClient, bobClient]) await ensureInvited(client)
  job = `test-${crypto.randomUUID()}`
})

describe('record_cron_heartbeat', () => {
  it('stamps a job with the database clock, and moves it forward on each run', async () => {
    const db = serviceClient()
    const before = Date.now()
    const { error } = await db.rpc('record_cron_heartbeat', { p_name: job })
    if (error) throw error
    const [first] = await readAs(db)
    expect(Math.abs(Date.parse(first.last_run_at) - before)).toBeLessThan(60_000)

    const { error: again } = await db.rpc('record_cron_heartbeat', { p_name: job })
    if (again) throw again
    const rows = await readAs(db)
    expect(rows).toHaveLength(1)
    expect(Date.parse(rows[0].last_run_at)).toBeGreaterThanOrEqual(Date.parse(first.last_run_at))
  })

  it('is the service role’s alone', async () => {
    await setRole(alice, 'owner')
    for (const client of [anonClient(), bobClient, aliceClient]) {
      const { error } = await client.rpc('record_cron_heartbeat', { p_name: job })
      expectError(error, { code: '42501', message: 'permission denied for function record_cron_heartbeat' })
    }
    expect(await readAs(serviceClient())).toEqual([])
  })
})

describe('cron_heartbeats', () => {
  beforeEach(async () => {
    const { error } = await serviceClient().rpc('record_cron_heartbeat', { p_name: job })
    if (error) throw error
  })

  it('is readable by admins and the owner only', async () => {
    for (const role of ['member', 'reviewer'] as const) {
      await setRole(bob, role)
      expect(await readAs(bobClient), role).toEqual([])
    }
    for (const role of ['admin', 'owner'] as const) {
      await setRole(bob, role)
      expect(await readAs(bobClient), role).toHaveLength(1)
    }
    const { data } = await anonClient().from('cron_heartbeats').select('name').eq('name', job)
    expect(data ?? []).toEqual([])
  })

  it('takes no direct writes, even from the owner', async () => {
    await setRole(alice, 'owner')
    const { error: insertErr } = await aliceClient.from('cron_heartbeats').insert({ name: `${job}-x`, last_run_at: new Date().toISOString() })
    expectError(insertErr, { code: '42501', message: 'permission denied for table cron_heartbeats' })
    const { error: updateErr } = await aliceClient.from('cron_heartbeats').update({ last_run_at: '2000-01-01T00:00:00Z' }).eq('name', job)
    expectError(updateErr, { code: '42501', message: 'permission denied for table cron_heartbeats' })
    const { error: deleteErr } = await aliceClient.from('cron_heartbeats').delete().eq('name', job)
    expectError(deleteErr, { code: '42501', message: 'permission denied for table cron_heartbeats' })
    expect(await readAs(serviceClient())).toHaveLength(1)
  })
})
