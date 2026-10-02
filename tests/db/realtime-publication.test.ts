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
        'markets',
        'market_resolutions',
        'parlays',
        'parlay_legs',
        'task_completions',
        'profiles',
        'market_comments',
        'market_categories',
      ]),
    )
  })

  it('publishes every table LiveRefresh subscribes to', async () => {
    expect(await publishedTables()).toEqual(expect.arrayContaining([...LIVE_TABLES]))
  })

  it('no longer publishes the tables the Broadcast pings replaced (0098)', async () => {
    const tables = await publishedTables()
    for (const table of ['market_outcomes', 'tasks', 'feed_reactions']) expect(tables).not.toContain(table)
  })

  it('no longer publishes cancelled_bets, which no page follows (0108)', async () => {
    expect(await publishedTables()).not.toContain('cancelled_bets')
  })

  it('publishes inserts, updates and deletes', async () => {
    const [publication] = await pgQuery<{ pubinsert: boolean; pubupdate: boolean; pubdelete: boolean }>(
      "select pubinsert, pubupdate, pubdelete from pg_publication where pubname = 'supabase_realtime'",
    )
    expect(publication).toEqual({ pubinsert: true, pubupdate: true, pubdelete: true })
  })
})
