import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { TYPE_LABELS, isLedgerType, listAllTransactions } from '@/lib/ledger/list-transactions'
import { listMemberNames } from '@/lib/members/list-members'
import { readEconomySummary } from '@/lib/economy/summary'
import { newestHref, readPageParams, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { cardClass } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { h2Class } from '@/components/ui/page'
import { LedgerRow } from '@/components/admin/ledger-row'
import { LedgerFilters } from '@/components/admin/ledger-filters'
import { EconomyCard } from '@/components/admin/economy-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { ContentReveal } from '@/components/nav/page-transition'
import { isUuid } from '@/lib/uuid'
import type { DbClient } from '@/lib/supabase/database'
import { cn } from '@/lib/utils'

const PATH = '/admin/ledger'
const ROW_ID_PREFIX = 'ledger'
const KINDS = Object.entries(TYPE_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label))

async function readMemberName(supabase: DbClient, id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.from('profiles').select('id, display_name').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? { id: data.id, name: data.display_name } : null
}

// The ledger's own URL with one filter changed, starting the list from the newest.
function hrefWith(searchParams: SearchParams, changes: Record<string, string | null>): string {
  const query = new URLSearchParams()
  for (const key of ['member', 'kind']) {
    const value = key in changes ? changes[key] : searchParams[key]
    if (typeof value === 'string' && value !== '') query.set(key, value)
  }
  const search = query.toString()
  return search ? `${PATH}?${search}` : PATH
}

export default async function AdminLedgerPage(props: PageProps<'/admin/ledger'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  if (!atLeast(role, 'admin')) redirect('/admin/tasks')

  // ?member= narrows the ledger to one member's movements, linked from their Admin page (#254) and
  // picked in the filter (#418), and ?kind= to one kind of movement. A malformed or unknown value
  // is ignored, as if it weren't there.
  const memberParam = typeof searchParams.member === 'string' && isUuid(searchParams.member) ? searchParams.member : null
  const kind = isLedgerType(searchParams.kind) ? searchParams.kind : null
  const [member, members] = await Promise.all([memberParam ? readMemberName(supabase, memberParam) : null, listMemberNames(supabase)])
  const filtered = Boolean(member || kind)
  // The economy's figures are the owner's alone, like balances (0052), and cover everyone.
  const [ledger, economy] = await Promise.all([
    listAllTransactions(supabase, readPageParams(searchParams, 'before'), { memberId: member?.id, type: kind ?? undefined }),
    atLeast(role, 'owner') && !filtered ? readEconomySummary(supabase) : null,
  ])
  const backToNewestHref = newestHref(PATH, searchParams, 'before')
  const kindLabel = kind ? TYPE_LABELS[kind] : null

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
          <Link href={hrefWith(searchParams, { member: null })} replace scroll={false}>
            Show everyone’s
          </Link>
        </p>
      )}
      <section aria-labelledby="ledger-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="ledger-title" className={cn(h2Class, 'pt-[18px] pb-1 md:pt-6')}>
          {member ? `${member.name}’s coin movements` : 'Every coin movement'}
        </h2>
        <div className="border-b border-line pt-2 pb-3.5">
          <LedgerFilters
            members={members.map((m) => ({ value: m.id, label: m.name }))}
            kinds={KINDS}
            member={member?.id ?? ''}
            kind={kind ?? ''}
          />
        </div>
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
            ) : kindLabel ? (
              <EmptyState
                title={member ? `No “${kindLabel}” movements for ${member.name}.` : `No “${kindLabel}” movements yet.`}
                action={
                  <Link
                    href={hrefWith(searchParams, { kind: null })}
                    replace
                    scroll={false}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    Show every kind
                  </Link>
                }
              />
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
              href={showMoreHref(PATH, searchParams, 'before', ledger.next)}
              fresh={ledger.next.kind === 'window'}
              focusId={rowDomId(ROW_ID_PREFIX, ledger.next.firstId)}
            />
          </div>
        )}
      </section>
    </ContentReveal>
  )
}
