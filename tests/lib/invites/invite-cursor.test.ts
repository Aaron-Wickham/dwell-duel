import { describe, it, expect } from 'vitest'
import { INVITE_ORDER, decodeInviteCursor, encodeInviteCursor } from '@/lib/invites/list-invites'

const TS = '2026-09-28T12:00:00.123456+00:00'

describe('invite cursor', () => {
  it('round-trips an email, which keyset.ts’s plain-token cursor can’t carry', () => {
    const c = { ts: TS, id: 'pat.k+church@example.com' }
    expect(decodeInviteCursor(encodeInviteCursor(c))).toEqual(c)
  })

  it('drops a cursor with an impossible time or no email', () => {
    expect(decodeInviteCursor(encodeInviteCursor({ ts: '2026-02-30T00:00:00Z', id: 'a@b.c' }))).toBeNull()
    expect(decodeInviteCursor(encodeInviteCursor({ ts: TS, id: '' }))).toBeNull()
    expect(decodeInviteCursor('x!')).toBeNull()
  })

  it('reads newest first after a key, with a plain created_at bound beside the tiebreak', () => {
    expect(INVITE_ORDER.after({ ts: TS, id: 'a"b@c.d' })).toBe(
      `and(created_at.lte."${TS}",or(created_at.lt."${TS}",and(created_at.eq."${TS}",email.lt."a\\"b@c.d")))`,
    )
  })
})
