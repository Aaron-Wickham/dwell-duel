import { describe, it, expect, beforeEach } from 'vitest'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

let admin: Member
let alice: Member

beforeEach(async () => {
  ;[alice, admin] = await seedMembers()
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
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
    const pending = await listPendingTaskCompletions(adminClient)

    expect(pending).toEqual([
      expect.objectContaining({ taskTitle: 'Read Ruth', submitterId: alice.id, submitterName: 'Alice', rewardAmount: 20 }),
    ])
  })
})
