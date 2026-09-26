import { describe, it, expect, beforeEach } from 'vitest'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestMarket, createTestTask, type Member } from './fixtures'

let admin: Member
let bob: Member

beforeEach(async () => {
  ;[admin, bob] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
})

describe('listAllTransactions', () => {
  it("carries each entry's member id alongside their name", async () => {
    const adminClient = await clientFor(admin)
    await ensureInvited(adminClient)

    const entries = await listAllTransactions(adminClient)

    expect(entries).toContainEqual(
      expect.objectContaining({ profileId: bob.id, memberName: 'Bob', amount: 100, type: 'Starting grant', context: 'Starting grant' }),
    )
  })

  it('builds a context line for a bet, a bet win and an approved task from their meta ids', async () => {
    const adminClient = await clientFor(admin)
    await ensureInvited(adminClient)

    const { taskId } = await createTestTask(admin, { title: 'Read Genesis 1-3', rewardAmount: 10 })
    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    const { error: approveErr } = await adminClient.rpc('approve_task_completion', { p_completion_id: completionId as string })
    expect(approveErr).toBeNull()

    const { marketId, outcomeIds } = await createTestMarket(adminClient, ['Yes', 'No'], { title: 'Will it rain?' })
    const { error: betErr } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 20,
    })
    expect(betErr).toBeNull()

    // Admin created and can resolve immediately, since an admin caller skips the close_at wait.
    const { error: resolveErr } = await adminClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(resolveErr).toBeNull()

    const entries = await listAllTransactions(adminClient)

    expect(entries).toContainEqual(expect.objectContaining({ context: 'Task approved: Read Genesis 1-3' }))
    expect(entries).toContainEqual(expect.objectContaining({ context: 'Bet on Yes in Will it rain?' }))
    expect(entries).toContainEqual(expect.objectContaining({ context: 'Bet won: Will it rain?' }))
  })
})
