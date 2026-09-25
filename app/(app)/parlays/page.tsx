import { redirect } from 'next/navigation'
import { Layers } from 'lucide-react'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import { EmptyState } from '@/components/ui/empty-state'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { requireUser } from '@/lib/auth/require-user'
import { getSlipView } from '@/lib/parlays/get-slip'
import { listMyParlays } from '@/lib/parlays/list-parlays'
import { readSlip } from '@/lib/parlays/slip'
import { SlipForm } from './slip-form'

export default async function ParlaysPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const slip = await getSlipView(supabase, await readSlip())
  const parlays = await listMyParlays(supabase, user.id)

  return (
    <Page>
      <PageHeader title="Parlays" />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <SlipForm slip={slip} />
        <SectionCard
          title="My parlays"
          titleId="my-parlays-title"
          className={parlays.length > 0 ? 'gap-1' : undefined}
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
      </div>
    </Page>
  )
}
