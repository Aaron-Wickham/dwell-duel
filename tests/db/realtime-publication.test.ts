import { describe, it, expect } from 'vitest'
import { pgQuery } from './pg-query'
import { LIVE_TABLES } from '@/components/live/live-refresh'

async function publishedTables(): Promise<string[]> {
  const rows = await pgQuery<{ tablename: string }>(
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'",
  )
  return rows.map((row) => row.tablename)
}

describe('supabase_realtime publication', () => {
  it('contains every table the live updates watch', async () => {
    expect(await publishedTables()).toEqual(
      expect.arrayContaining([
        'activity_events',
        'bets',
        'cancelled_bets',
        'markets',
        'market_resolutions',
        'parlays',
        'parlay_legs',
        'tasks',
        'task_completions',
        'profiles',
        'feed_reactions',
        'market_comments',
      ]),
    )
  })

  it('publishes every table LiveRefresh subscribes to', async () => {
    expect(await publishedTables()).toEqual(expect.arrayContaining([...LIVE_TABLES]))
  })

  it('publishes inserts, updates and deletes', async () => {
    const [publication] = await pgQuery<{ pubinsert: boolean; pubupdate: boolean; pubdelete: boolean }>(
      "select pubinsert, pubupdate, pubdelete from pg_publication where pubname = 'supabase_realtime'",
    )
    expect(publication).toEqual({ pubinsert: true, pubupdate: true, pubdelete: true })
  })
})
