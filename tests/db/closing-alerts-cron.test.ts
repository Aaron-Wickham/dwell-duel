import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { pgQuery } from './pg-query'
import { serviceClient, type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, anonClient, ensureInvited, createTestMarket, type Member } from './fixtures'

// GitHub dropped most runs of the ten-minute workflow (#189), so pg_cron is the timer now: every
// minute, calling the app only when a market has just closed or the heartbeat is getting old.
let alice: Member
let aliceClient: TestClient

async function ping(): Promise<number | null> {
  const [row] = await pgQuery<{ id: number | null }>('select public.ping_closing_alerts() as id')
  return row.id
}

// Nothing reachable listens on port 9, so a queued request just fails in pg_net's worker.
async function setSecrets(): Promise<void> {
  await pgQuery(`
    select vault.create_secret('http://127.0.0.1:9/', 'app_url');
    select vault.create_secret('test-secret', 'cron_secret');
  `)
}

async function heartbeatAgo(minutes: number): Promise<void> {
  await pgQuery(`
    insert into public.cron_heartbeats (name, last_run_at) values ('closing-alerts', now() - interval '${minutes} minutes')
    on conflict (name) do update set last_run_at = excluded.last_run_at;
  `)
}

// Other tests leave recently closed markets behind; claim their alerts so only this test's count.
async function claimRecentlyClosed(): Promise<void> {
  await pgQuery(`
    insert into public.push_log (kind, ref)
    select k.kind, m.id::text
    from public.markets m
    cross join (values ('resolve_reminder'), ('market_alert')) k(kind)
    where m.status = 'open' and m.close_at <= now()
    on conflict do nothing;
  `)
}

beforeEach(async () => {
  ;[alice] = await seedMembers()
  aliceClient = await clientFor(alice)
  await ensureInvited(aliceClient)
})

afterEach(async () => {
  await pgQuery(`
    delete from vault.secrets where name in ('app_url', 'cron_secret');
    delete from public.cron_heartbeats where name = 'closing-alerts';
  `)
})

describe('closing alerts in pg_cron', () => {
  it('checks every minute', async () => {
    const jobs = await pgQuery<{ schedule: string; command: string }>(
      "select schedule, command from cron.job where jobname = 'closing-alerts'",
    )
    expect(jobs).toEqual([{ schedule: '* * * * *', command: 'select public.ping_closing_alerts()' }])
  })

  it('does nothing without the Vault secrets, as on the local stack and in CI', async () => {
    await heartbeatAgo(60)
    expect(await ping()).toBeNull()
  })

  it('stays quiet while nothing has just closed and the heartbeat is fresh', async () => {
    await setSecrets()
    await claimRecentlyClosed()
    await heartbeatAgo(1)
    expect(await ping()).toBeNull()
  })

  it('calls the app within the minute a market closes', async () => {
    await setSecrets()
    await claimRecentlyClosed()
    await heartbeatAgo(1)
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', market.marketId)
    if (error) throw error
    expect(await ping()).not.toBeNull()
  })

  it('calls the app when the heartbeat is over nine minutes old, even with nothing new', async () => {
    await setSecrets()
    await claimRecentlyClosed()
    await heartbeatAgo(10)
    expect(await ping()).not.toBeNull()
  })

  it('is not callable by members or anonymous visitors', async () => {
    for (const client of [aliceClient, anonClient()]) {
      const { error } = await client.rpc('ping_closing_alerts')
      expectError(error, { code: '42501', message: 'permission denied for function ping_closing_alerts' })
    }
  })
})
