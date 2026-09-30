import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, expectError } from './helpers'
import { seedMembers, clientFor, createTestTask, anonClient, type Member } from './fixtures'

// my_task_streaks (0054, #82): consecutive periods with an approved completion, ending in the
// current period or the one before it. p_at pins "now" so these tests don't depend on the clock.
let alice: Member
let bob: Member
let bobClient: TestClient

type StreakRow = { task_id: string; streak: number; includes_current: boolean }

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  bobClient = await clientFor(bob)
})

async function complete(
  taskId: string,
  member: Member,
  keys: string[],
  status: 'approved' | 'pending' | 'rejected' = 'approved',
): Promise<void> {
  const reviewed = status === 'pending' ? {} : { reviewed_at: '2026-01-01T00:00:00Z', reviewed_by: alice.id }
  const { error } = await serviceClient()
    .from('task_completions')
    .insert(keys.map((period_key) => ({ task_id: taskId, profile_id: member.id, status, reward_amount: 10, period_key, ...reviewed })))
  if (error) throw error
}

async function streaks(at: string, client: TestClient = bobClient): Promise<StreakRow[]> {
  const { data, error } = await client.rpc('my_task_streaks', { p_at: at })
  if (error) throw error
  return data as StreakRow[]
}

async function streakFor(taskId: string, at: string): Promise<StreakRow | undefined> {
  return (await streaks(at)).find((r) => r.task_id === taskId)
}

// Monday 9 March 2026, noon EDT: the day after the clocks went forward.
const MON_9_MARCH = '2026-03-09T16:00:00Z'

describe('my_task_streaks', () => {
  it('counts a daily run through today, across the spring-forward change', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'daily' })
    await complete(taskId, bob, ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'])
    expect(await streakFor(taskId, MON_9_MARCH)).toEqual({ task_id: taskId, streak: 4, includes_current: true })
  })

  it('keeps a run that ended yesterday alive until Eastern midnight', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'daily' })
    await complete(taskId, bob, ['2026-03-07', '2026-03-08'])
    expect(await streakFor(taskId, MON_9_MARCH)).toEqual({ task_id: taskId, streak: 2, includes_current: false })
    // 23:30 EDT on the 9th, after midnight UTC: still the 9th in Eastern time.
    expect((await streakFor(taskId, '2026-03-10T03:30:00Z'))?.streak).toBe(2)
    // 00:30 EDT on the 10th: the 9th passed with nothing, so the run is over.
    expect(await streakFor(taskId, '2026-03-10T04:30:00Z')).toBeUndefined()
  })

  it('resets at a gap, counting only the run since it', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'daily' })
    await complete(taskId, bob, ['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-07', '2026-03-08'])
    expect((await streakFor(taskId, MON_9_MARCH))?.streak).toBe(2)
  })

  it('has no streak once a whole period has gone by', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'daily' })
    await complete(taskId, bob, ['2026-03-05', '2026-03-06', '2026-03-07'])
    expect(await streakFor(taskId, MON_9_MARCH)).toBeUndefined()
  })

  it("doesn't count a pending or rejected completion", async () => {
    const pendingTask = await createTestTask(alice, { title: 'Pending', isRepeatable: true, period: 'daily' })
    await complete(pendingTask.taskId, bob, ['2026-03-06', '2026-03-07'])
    await complete(pendingTask.taskId, bob, ['2026-03-08', '2026-03-09'], 'pending')

    const rejectedTask = await createTestTask(alice, { title: 'Rejected', isRepeatable: true, period: 'daily' })
    await complete(rejectedTask.taskId, bob, ['2026-03-06', '2026-03-08'])
    await complete(rejectedTask.taskId, bob, ['2026-03-07'], 'rejected')

    expect(await streakFor(pendingTask.taskId, MON_9_MARCH)).toBeUndefined()
    expect((await streakFor(rejectedTask.taskId, MON_9_MARCH))?.streak).toBe(1)
  })

  it('counts weekly runs across an ISO year with 53 weeks', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'weekly' })
    await complete(taskId, bob, ['2020-W51', '2020-W52', '2020-W53', '2021-W01'])
    // Tuesday 5 January 2021 is in 2021-W01.
    expect(await streakFor(taskId, '2021-01-05T17:00:00Z')).toEqual({ task_id: taskId, streak: 4, includes_current: true })
    // Sunday night 10 January, 23:30 EST: still week 1.
    expect((await streakFor(taskId, '2021-01-11T04:30:00Z'))?.includes_current).toBe(true)
    // The next Tuesday, in 2021-W02: last week still counts.
    expect(await streakFor(taskId, '2021-01-12T17:00:00Z')).toEqual({ task_id: taskId, streak: 4, includes_current: false })
    expect(await streakFor(taskId, '2021-01-19T17:00:00Z')).toBeUndefined()
  })

  it('counts weekly runs from a 52-week year into the next', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'weekly' })
    await complete(taskId, bob, ['2025-W51', '2025-W52', '2026-W01'])
    expect((await streakFor(taskId, '2026-01-06T17:00:00Z'))?.streak).toBe(3)
  })

  it('counts monthly runs across a year and resets at a skipped month', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'monthly' })
    await complete(taskId, bob, ['2025-10', '2025-12', '2026-01', '2026-02'])
    expect(await streakFor(taskId, MON_9_MARCH)).toEqual({ task_id: taskId, streak: 3, includes_current: false })
  })

  it('counts yearly runs', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'yearly' })
    await complete(taskId, bob, ['2024', '2025', '2026'])
    expect(await streakFor(taskId, MON_9_MARCH)).toEqual({ task_id: taskId, streak: 3, includes_current: true })
  })

  it('leaves out one-off tasks and other members', async () => {
    const oneOff = await createTestTask(alice, { title: 'Once' })
    await complete(oneOff.taskId, bob, ['once'])
    const daily = await createTestTask(alice, { title: 'Daily', isRepeatable: true, period: 'daily' })
    await complete(daily.taskId, alice, ['2026-03-08', '2026-03-09'])

    expect(await streaks(MON_9_MARCH)).toEqual([])
    const aliceRows = await streaks(MON_9_MARCH, await clientFor(alice))
    expect(aliceRows).toEqual([{ task_id: daily.taskId, streak: 2, includes_current: true }])
  })

  it('is closed to signed-out callers', async () => {
    const { error } = await anonClient().rpc('my_task_streaks')
    expectError(error, { code: '42501', message: 'permission denied for function my_task_streaks' })
  })

  it("keeps period_index to the database's own functions", async () => {
    const { error } = await bobClient.rpc('period_index', { p_period: 'daily', p_key: '2026-03-09' })
    expectError(error, { code: '42501', message: 'permission denied for function period_index' })
  })

  it('reads the default clock when no time is given', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'daily' })
    const { data: today, error } = await bobClient.rpc('compute_period_key', { p_period: 'daily' })
    if (error) throw error
    await complete(taskId, bob, [today])
    const { data, error: streakError } = await bobClient.rpc('my_task_streaks')
    expect(streakError).toBeNull()
    expect(data).toEqual([{ task_id: taskId, streak: 1, includes_current: true }])
  })
})
