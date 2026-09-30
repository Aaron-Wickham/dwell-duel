import { describe, it, expect } from 'vitest'
import { pgQuery } from './pg-query'

// 0064's every-minute job leaves a cron.job_run_details row a minute (#210); 0065 prunes them daily.
describe('cron history cleanup', () => {
  it('runs once a day and keeps a week of run details', async () => {
    const jobs = await pgQuery<{ schedule: string; command: string; active: boolean }>(
      "select schedule, command, active from cron.job where jobname = 'cron-history-cleanup'",
    )
    expect(jobs).toEqual([
      {
        schedule: '17 4 * * *',
        command: "delete from cron.job_run_details where end_time < now() - interval '7 days'",
        active: true,
      },
    ])
  })

  it('deletes only runs older than a week', async () => {
    await pgQuery(`
      insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)
      values
        (0, 900000001, 1, 'postgres', 'postgres', 'select 1', 'succeeded', '', now() - interval '8 days', now() - interval '8 days'),
        (0, 900000002, 1, 'postgres', 'postgres', 'select 1', 'succeeded', '', now() - interval '6 days', now() - interval '6 days')
    `)
    const [{ command }] = await pgQuery<{ command: string }>("select command from cron.job where jobname = 'cron-history-cleanup'")
    await pgQuery(command)
    const left = await pgQuery<{ runid: number | string }>(
      'select runid from cron.job_run_details where runid in (900000001, 900000002) order by runid',
    )
    expect(left.map((r) => Number(r.runid))).toEqual([900000002])
    await pgQuery('delete from cron.job_run_details where runid = 900000002')
  })
})
