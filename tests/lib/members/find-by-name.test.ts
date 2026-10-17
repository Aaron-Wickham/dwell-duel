import { describe, expect, it } from 'vitest'
import { NAME_MATCHES_SHOWN, findMembersByName } from '@/lib/members/find-by-name'
import type { DbClient } from '@/lib/supabase/database'

// Records each ilike pattern and limit, answering from `answers` in turn.
function fakeClient(answers: { id: string; display_name: string }[][]) {
  const calls: { pattern: string; limit: number }[] = []
  const client = {
    from: () => ({
      select: () => ({
        ilike: (_column: string, pattern: string) => ({
          order: () => ({
            order: () => ({
              limit: async (limit: number) => {
                calls.push({ pattern, limit })
                return { data: answers[calls.length - 1] ?? [], error: null }
              },
            }),
          }),
        }),
      }),
    }),
  }
  return { client: client as unknown as DbClient, calls }
}

describe('findMembersByName', () => {
  it('takes a whole name, any case, before names containing it', async () => {
    const { client, calls } = fakeClient([[{ id: 'b', display_name: 'Bob' }]])
    expect(await findMembersByName(client, 'bob')).toEqual([{ id: 'b', name: 'Bob' }])
    expect(calls).toEqual([{ pattern: 'bob', limit: NAME_MATCHES_SHOWN + 1 }])
  })

  it('falls back to names containing it, matched literally', async () => {
    const { client, calls } = fakeClient([[], [{ id: 'c', display_name: 'Top_100%' }]])
    expect(await findMembersByName(client, '_100%')).toEqual([{ id: 'c', name: 'Top_100%' }])
    expect(calls.map((c) => c.pattern)).toEqual(['\\_100\\%', '%\\_100\\%%'])
  })
})
