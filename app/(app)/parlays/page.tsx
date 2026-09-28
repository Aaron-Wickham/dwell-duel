import { redirect } from 'next/navigation'
import { Layers } from 'lucide-react'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import { EmptyState } from '@/components/ui/empty-state'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listMyParlays } from '@/lib/parlays/list-parlays'

export default async function ParlaysPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const parlays = await listMyParlays(supabase, user.id)

  return (
    <Page transition="tab">
      <PageHeader
        title="Parlays"
        description="Build one in your slip: switch two or more picks from different markets to Parlay."
      />
      <LiveTables subscriptions={pageSubscriptions.parlays(user.id)} />
      <SectionCard
        title="My parlays"
        titleId="my-parlays-title"
        className={parlays.length > 0 ? 'max-w-[820px] gap-1' : 'max-w-[820px]'}
      >
        {parlays.length === 0 ? (
          <EmptyState icon={Layers} title="No parlays yet.">
            Parlays you place show up here.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {parlays.map((p) => (
              <PlacedParlay key={p.id} parlay={p} />
            ))}
          </ul>
        )}
      </SectionCard>
    </Page>
  )
}
