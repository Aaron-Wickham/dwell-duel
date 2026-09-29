import { requireUser } from '@/lib/auth/require-user'
import { readMemberStats } from '@/lib/members/stats'
import { ContentReveal } from '@/components/nav/page-transition'
import { MemberStatsCard } from '@/components/members/member-stats-card'

export async function MemberStats({ memberId }: { memberId: string }) {
  const { supabase } = await requireUser()
  const stats = await readMemberStats(supabase, memberId)
  return (
    <ContentReveal>
      <MemberStatsCard stats={stats} />
    </ContentReveal>
  )
}
