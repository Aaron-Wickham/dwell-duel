import { describe, expect, it, vi } from 'vitest'
import { CLOSING_ALERTS_STALE_MS, closingAlertsHealth, readClosingAlertsHealth } from '@/lib/admin/cron-health'
import type { DbClient } from '@/lib/supabase/database'

const NOW = Date.parse('2026-09-29T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const PUSH = { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private' }

describe('closingAlertsHealth', () => {
  it('is healthy up to and including 30 minutes since the last run', () => {
    expect(closingAlertsHealth(ago(0), NOW)).toEqual({ stale: false })
    expect(closingAlertsHealth(ago(CLOSING_ALERTS_STALE_MS), NOW)).toEqual({ stale: false })
  })

  it('is stale past 30 minutes, and when the schedule has never run', () => {
    const last = ago(CLOSING_ALERTS_STALE_MS + 1000)
    expect(closingAlertsHealth(last, NOW)).toEqual({ stale: true, lastRunAt: last })
    expect(closingAlertsHealth(null, NOW)).toEqual({ stale: true, lastRunAt: null })
  })
})

function clientReturning(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data, error }))
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { client: { from } as unknown as DbClient, from, eq }
}

describe('readClosingAlertsHealth', () => {
  it.each(['member', 'reviewer'] as const)('costs a %s no query and never warns them', async (role) => {
    const { client, from } = clientReturning(null)
    expect(await readClosingAlertsHealth(client, role, NOW, PUSH)).toEqual({ stale: false })
    expect(from).not.toHaveBeenCalled()
  })

  it('never warns without push keys, where the schedule has nothing to send', async () => {
    const { client, from } = clientReturning(null)
    expect(await readClosingAlertsHealth(client, 'owner', NOW, {})).toEqual({ stale: false })
    expect(from).not.toHaveBeenCalled()
  })

  it.each(['admin', 'owner'] as const)('reads the closing-alerts heartbeat for an %s', async (role) => {
    const { client, from, eq } = clientReturning({ last_run_at: ago(CLOSING_ALERTS_STALE_MS * 2) })
    expect(await readClosingAlertsHealth(client, role, NOW, PUSH)).toMatchObject({ stale: true })
    expect(from).toHaveBeenCalledWith('cron_heartbeats')
    expect(eq).toHaveBeenCalledWith('name', 'closing-alerts')
  })

  it('warns when no run was ever recorded', async () => {
    const { client } = clientReturning(null)
    expect(await readClosingAlertsHealth(client, 'owner', NOW, PUSH)).toEqual({ stale: true, lastRunAt: null })
  })

  it('degrades to unknown when the read throws, too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = { from: () => { throw new Error('boom') } } as unknown as DbClient
    expect(await readClosingAlertsHealth(client, 'owner', NOW, PUSH)).toEqual({ stale: false, unknown: true })
  })

  it('degrades to unknown when the read fails, and logs it, instead of throwing through every Admin page', async () => {
    const failure = new Error('db down')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = clientReturning(null, failure)
    expect(await readClosingAlertsHealth(client, 'owner', NOW, PUSH)).toEqual({ stale: false, unknown: true })
    expect(log).toHaveBeenCalledWith('Reading the closing-alerts heartbeat failed', failure)
  })
})
