import { describe, it, expect } from 'vitest'
import { pgQuery } from './pg-query'
import { seedMembers, clientFor, anonClient, ensureInvited } from './fixtures'

// GitHub dropped most runs of the ten-minute workflow (#189), so pg_cron is the timer now.
describe('closing alerts in pg_cron', () => {
  it('runs ping_closing_alerts every ten minutes', async () => {
    const jobs = await pgQuery<{ schedule: string; command: string }>(
      "select schedule, command from cron.job where jobname = 'closing-alerts'",
    )
    expect(jobs).toEqual([{ schedule: '*/10 * * * *', command: 'select public.ping_closing_alerts()' }])
  })

  it('does nothing without the Vault secrets, as on the local stack and in CI', async () => {
    const [row] = await pgQuery<{ id: number | null }>('select public.ping_closing_alerts() as id')
    expect(row.id).toBeNull()
  })

  it('is not callable by members or anonymous visitors', async () => {
    const [alice] = await seedMembers()
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    for (const client of [aliceClient, anonClient()]) {
      const { error } = await client.rpc('ping_closing_alerts')
      expect(error).not.toBeNull()
    }
  })
})
