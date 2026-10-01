import Link from 'next/link'
import { NotebookText } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { ContentReveal } from '@/components/nav/page-transition'
import { listMemberTransactions } from '@/lib/ledger/list-transactions'
import { LedgerRow } from '@/components/admin/ledger-row'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

const RECENT = 5

// The member's latest coin movements, and the way to all of them in Admin › Ledger.
export async function CoinHistory({ memberId }: { memberId: string }) {
  const { supabase } = await requireUser()
  const entries = await listMemberTransactions(supabase, memberId, RECENT)
  return (
    <ContentReveal>
      <SectionCard
        title="Coin history"
        titleId="coin-history"
        action={
          <Link href={`/admin/ledger?member=${memberId}`} transitionTypes={['nav-forward']} className="hit-area shrink-0 text-sm font-bold">
            Open in Ledger
          </Link>
        }
        className="gap-1"
      >
        {entries.length === 0 ? (
          <div className="pt-2">
            <EmptyState icon={NotebookText} title="No coin movements yet." />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((e) => (
              <LedgerRow key={e.id} entry={e} showMember={false} />
            ))}
          </ul>
        )}
      </SectionCard>
    </ContentReveal>
  )
}

export function CoinHistorySkeleton() {
  return (
    <SkeletonCard className="gap-1">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col divide-y divide-line">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 py-3.5">
            <Skeleton className="h-4 grow" />
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  )
}
