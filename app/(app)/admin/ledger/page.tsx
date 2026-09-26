import { redirect } from 'next/navigation'
import { NotebookText } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { cardClass } from '@/components/ui/card'
import { LedgerRow } from '@/components/admin/ledger-row'
import { EmptyState } from '@/components/ui/empty-state'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

export default async function AdminLedgerPage(props: PageProps<'/admin/ledger'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const ledger = await listAllTransactions(supabase, readPageParams(searchParams, 'before'))

  return (
    <ContentReveal>
      <section aria-labelledby="ledger-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="ledger-title" className="sr-only">
          Every coin movement
        </h2>
        {ledger.windowed && (
          <div className="flex flex-col border-b border-line py-3.5">
            <BackToNewest href={newestHref('/admin/ledger', searchParams, 'before')} />
          </div>
        )}
        {ledger.rows.length === 0 ? (
          <div className="py-[18px] md:py-6">
            <EmptyState icon={NotebookText} title="No coin movements yet." />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {ledger.rows.map((e) => (
              <LedgerRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
        {ledger.next && (
          <div className="flex flex-col border-t border-line py-3.5">
            <ShowMore
              href={showMoreHref('/admin/ledger', searchParams, 'before', ledger.next)}
              fresh={ledger.next.kind === 'window'}
            />
          </div>
        )}
      </section>
    </ContentReveal>
  )
}
