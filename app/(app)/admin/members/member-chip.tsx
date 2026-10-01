import type { MemberSummary } from '@/lib/members/list-members'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { StatusChip } from '@/components/ui/status-chip'

const ROLE_TONE = { owner: 'done', admin: 'open', reviewer: 'wait' } as const

// A removed member's role is already back to Member, so Removed takes the role's place (#265).
export function MemberChip({ member }: { member: Pick<MemberSummary, 'role' | 'removed'> }) {
  if (member.removed) return <StatusChip tone="void">Removed</StatusChip>
  if (member.role === 'member') return null
  return <StatusChip tone={ROLE_TONE[member.role]}>{ROLE_LABELS[member.role]}</StatusChip>
}
