import { describe, it, expect, beforeEach } from 'vitest'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { serviceClient } from './helpers'
import { PAGE_SIZE, decodeCursor } from '@/lib/pagination/cursor'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member, giveRole } from './fixtures'

let admin: Member
let alice: Member

beforeEach(async () => {
  ;[alice, admin] = await seedMembers()
  await giveRole(admin, 'admin')
})

describe('listPendingTaskCompletions', () => {
  it("carries the submitter's id and the reward", async () => {
    const { taskId } = await createTestTask(admin, { title: 'Read Ruth', rewardAmount: 20 })
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()

    const adminClient = await clientFor(admin)
    await ensureInvited(adminClient)
    const pending = await listPendingTaskCompletions(adminClient, { top: null, bottom: null })

    expect(pending.rows).toEqual([
      expect.objectContaining({ taskTitle: 'Read Ruth', submitterId: alice.id, submitterName: 'Alice', rewardAmount: 20 }),
    ])
  })

  it('pages the queue oldest first, without skipping or repeating a row', async () => {
    const { taskId } = await createTestTask(admin, { title: 'Daily psalm', isRepeatable: true, period: 'daily' })
    const total = PAGE_SIZE + 5
    const db = serviceClient()
    const { error } = await db.from('task_completions').insert(
      Array.from({ length: total }, (_, i) => ({
        task_id: taskId,
        profile_id: alice.id,
        status: 'pending',
        reward_amount: 5,
        period_key: `k${String(i).padStart(3, '0')}`,
        submitted_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      })),
    )
    expect(error).toBeNull()

    const adminClient = await clientFor(admin)
    await ensureInvited(adminClient)
    const first = await listPendingTaskCompletions(adminClient, { top: null, bottom: null })
    expect(first.rows).toHaveLength(PAGE_SIZE)
    expect(first.next?.kind).toBe('extend')

    const cursor = decodeCursor(first.next?.cursor)
    const second = await listPendingTaskCompletions(adminClient, { top: null, bottom: cursor })
    const ids = second.rows.map((r) => r.id)
    expect(ids).toHaveLength(total)
    expect(new Set(ids).size).toBe(total)
    expect(second.rows.map((r) => r.submittedAt)).toEqual([...second.rows.map((r) => r.submittedAt)].sort())
    expect(second.next).toBeNull()
  })
})
