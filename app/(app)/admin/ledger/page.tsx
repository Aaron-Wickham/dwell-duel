import { redirect } from 'next/navigation'
import { NotebookText } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { cardClass } from '@/components/ui/card'
import { LedgerRow } from '@/components/admin/ledger-row'
import { EmptyState } from '@/components/ui/empty-state'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

export default async function AdminLedgerPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const entries = await listAllTransactions(supabase)

  return (
    <ContentReveal>
      <section aria-labelledby="ledger-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="ledger-title" className="sr-only">
          Every coin movement
        </h2>
        {entries.length === 0 ? (
          <div className="py-[18px] md:py-6">
            <EmptyState icon={NotebookText} title="No coin movements yet." />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((e) => (
              <LedgerRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </section>
    </ContentReveal>
  )
}
