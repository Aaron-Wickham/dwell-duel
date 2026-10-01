// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemberActivity } from '@/app/(app)/admin/members/member-activity'
import { formatDay } from '@/lib/markets/format-date'

const NOW = Date.parse('2026-09-28T12:00:00Z')
const JOINED = '2026-09-20T12:00:00Z'
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString()

function activityText(joinedAt: string | null, lastSignInAt: string | null): string | null {
  const { container } = render(<MemberActivity joinedAt={joinedAt} lastSignInAt={lastSignInAt} now={NOW} />)
  return container.textContent
}

describe('MemberActivity (#85)', () => {
  it('shows the join day and a relative last sign-in within the week', () => {
    expect(activityText(JOINED, hoursAgo(2))).toBe(`Joined ${formatDay(JOINED)} · Active 2h ago`)
  })

  it('switches to a day once the last sign-in is over a week old', () => {
    const old = hoursAgo(24 * 10)
    expect(activityText(JOINED, old)).toBe(`Joined ${formatDay(JOINED)} · Active ${formatDay(old)}`)
  })

  it('says when someone has never signed in', () => {
    expect(activityText(JOINED, null)).toBe(`Joined ${formatDay(JOINED)} · Never signed in`)
  })

  it('leaves out the join day when it isn’t known', () => {
    expect(activityText(null, hoursAgo(0))).toBe('Active just now')
  })

  it('marks both dates up as machine-readable times', () => {
    const last = hoursAgo(3)
    const { container } = render(<MemberActivity joinedAt={JOINED} lastSignInAt={last} now={NOW} />)
    expect([...container.querySelectorAll('time')].map((t) => t.getAttribute('datetime'))).toEqual([JOINED, last])
  })
})
