import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { readEconomySummary } from '@/lib/economy/summary'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { cardClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { LedgerRow } from '@/components/admin/ledger-row'
import { EconomyCard } from '@/components/admin/economy-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { ContentReveal } from '@/components/nav/page-transition'
import { isUuid } from '@/lib/uuid'
import type { DbClient } from '@/lib/supabase/database'
import { cn } from '@/lib/utils'

const ROW_ID_PREFIX = 'ledger'

async function readMemberName(supabase: DbClient, id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.from('profiles').select('id, display_name').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? { id: data.id, name: data.display_name } : null
}

export default async function AdminLedgerPage(props: PageProps<'/admin/ledger'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  if (!atLeast(role, 'admin')) redirect('/admin/tasks')

  // ?member= narrows the ledger to one member's movements, linked from their Admin page (#254).
  // A malformed or unknown id shows everyone's, as the plain ledger.
  const memberParam = typeof searchParams.member === 'string' && isUuid(searchParams.member) ? searchParams.member : null
  const member = memberParam ? await readMemberName(supabase, memberParam) : null
  // The economy's figures are the owner's alone, like balances (0052), and cover everyone.
  const [ledger, economy] = await Promise.all([
    listAllTransactions(supabase, readPageParams(searchParams, 'before'), member?.id),
    atLeast(role, 'owner') && !member ? readEconomySummary(supabase) : null,
  ])
  const backToNewestHref = newestHref('/admin/ledger', searchParams, 'before')

  return (
    <ContentReveal>
      {economy && <EconomyCard summary={economy} />}
      {member && (
        <p className="text-sm text-ink2">
          Showing {member.name}’s coin movements.{' '}
          <Link href={`/admin/members/${member.id}`} transitionTypes={['nav-forward']}>
            Open {member.name}
          </Link>
          {' · '}
          <Link href="/admin/ledger" replace scroll={false}>
            Show everyone’s
          </Link>
        </p>
      )}
      <section aria-labelledby="ledger-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="ledger-title" className={cn(h2Class, 'pt-[18px] pb-1 md:pt-6')}>
          {member ? `${member.name}’s coin movements` : 'Every coin movement'}
        </h2>
        <ShowMoreFocus />
        {ledger.windowed && ledger.rows.length > 0 && (
          <div className="flex flex-col border-b border-line py-3.5">
            <BackToNewest href={backToNewestHref} />
          </div>
        )}
        {ledger.rows.length === 0 ? (
          <div className="py-[18px] md:py-6">
            {ledger.windowed ? (
              <NothingOlder href={backToNewestHref} />
            ) : (
              <EmptyState title={member ? `No coin movements for ${member.name} yet.` : 'No coin movements yet.'} />
            )}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {ledger.rows.map((e) => (
              <LedgerRow key={e.id} entry={e} domId={rowDomId(ROW_ID_PREFIX, e.id)} />
            ))}
          </ul>
        )}
        {ledger.next && (
          <div className="flex flex-col border-t border-line py-3.5">
            <ShowMore
              href={showMoreHref('/admin/ledger', searchParams, 'before', ledger.next)}
              fresh={ledger.next.kind === 'window'}
              focusId={rowDomId(ROW_ID_PREFIX, ledger.next.firstId)}
            />
          </div>
        )}
      </section>
    </ContentReveal>
  )
}
