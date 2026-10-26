import type { Metadata } from 'next'
import { Suspense, use } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { TYPE_LABELS, isLedgerType, listAllTransactions } from '@/lib/ledger/list-transactions'
import { NAME_MATCHES_SHOWN, findMembersByName, type MemberName } from '@/lib/members/find-by-name'
import { readEconomySummary, type EconomySummary } from '@/lib/economy/summary'
import { newestHref, readPageParams, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { cardClass } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { h2Class } from '@/components/ui/page'
import { LedgerRow } from '@/components/admin/ledger-row'
import { LedgerFilters } from '@/components/admin/ledger-filters'
import { EconomyCard, EconomyCardSkeleton } from '@/components/admin/economy-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { ContentReveal } from '@/components/nav/page-transition'
import { readSearchQuery } from '@/lib/search/query'
import { isUuid } from '@/lib/uuid'
import type { DbClient } from '@/lib/supabase/database'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Ledger' }

const PATH = '/admin/ledger'
const ROW_ID_PREFIX = 'ledger'
const MEMBER_ERROR_ID = 'ledger-member-error'
const KINDS = Object.entries(TYPE_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label))

async function readMemberName(supabase: DbClient, id: string): Promise<MemberName | null> {
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

  // ?member= narrows the ledger to one member's movements, linked from their Admin page (#254), and
  // ?kind= to one kind of movement (#418). The filter's box sends a name instead (#430): one that
  // fits a single member redirects to their id, so "Show more" pages by id and never searches again;
  // one that fits nobody, or several, says so in place of the list. An unknown id or kind is
  // ignored, as if it weren't there.
  const memberParam = readSearchQuery(searchParams.member)
  const kind = isLedgerType(searchParams.kind) ? searchParams.kind : null
  let member: MemberName | null = null
  let matches: MemberName[] | null = null
  if (isUuid(memberParam)) member = await readMemberName(supabase, memberParam)
  else if (memberParam) {
    matches = await findMembersByName(supabase, memberParam)
    if (matches.length === 1) redirect(hrefWith(searchParams, { member: matches[0].id }))
  }
  const filtered = Boolean(member || kind || matches)
  // The economy's figures are the owner's alone, like balances (0052), and cover everyone. Read
  // beside the ledger, but streamed after it.
  const economy = atLeast(role, 'owner') && !filtered ? readEconomySummary(supabase) : null
  // Its failure surfaces where it's used; this only stops a ledger failure leaving it unhandled.
  economy?.catch(() => {})
  const ledger = matches
    ? null
    : await listAllTransactions(supabase, readPageParams(searchParams, 'before'), { memberId: member?.id, type: kind ?? undefined })
  const kindLabel = kind ? TYPE_LABELS[kind] : null

  return (
    <ContentReveal>
      {/* Only the owner gets it, and the route's skeleton can't know who's looking, so that draws
          only the ledger; once the page knows, the card streams behind its own skeleton at its
          real height, so the ledger under it doesn't move when the figures land (ADM-3). */}
      {economy && (
        <Suspense fallback={<EconomyCardSkeleton />}>
          <OwnerEconomy summary={economy} />
        </Suspense>
      )}
      {member && (
        <p className="text-sm text-ink2">
          Showing {member.name}’s coin movements.{' '}
          <Link href={`/admin/members/${member.id}`} transitionTypes={['nav-forward']} className="prose-link">
            Open {member.name}
          </Link>
          {' · '}
          <Link href={hrefWith(searchParams, { member: null })} replace scroll={false} className="prose-link">
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
            kinds={KINDS}
            member={member?.name ?? (matches ? memberParam : '')}
            memberId={member?.id}
            kind={kind ?? ''}
            memberErrorId={matches ? MEMBER_ERROR_ID : undefined}
          />
        </div>
        <ShowMoreFocus />
        {!ledger ? (
          <div id={MEMBER_ERROR_ID} className="py-[18px] md:py-6">
            <NameMatches name={memberParam} matches={matches ?? []} searchParams={searchParams} />
          </div>
        ) : (
          <LedgerList ledger={ledger} member={member} kindLabel={kindLabel} searchParams={searchParams} />
        )}
      </section>
    </ContentReveal>
  )
}

function OwnerEconomy({ summary }: { summary: Promise<EconomySummary> }) {
  return <EconomyCard summary={use(summary)} />
}

// A typed name that picked nobody, or more than one member: each match links to their movements.
function NameMatches({ name, matches, searchParams }: { name: string; matches: MemberName[]; searchParams: SearchParams }) {
  if (matches.length === 0) {
    return (
      <EmptyState
        title={`No member matches “${name}”.`}
        action={
          <Link
            href={hrefWith(searchParams, { member: null })}
            replace
            scroll={false}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            Show everyone’s
          </Link>
        }
      >
        Try part of their name.
      </EmptyState>
    )
  }
  const shown = matches.slice(0, NAME_MATCHES_SHOWN)
  return (
    <EmptyState title={`More than one member matches “${name}”.`}>
      {matches.length > NAME_MATCHES_SHOWN ? 'Type more of their name, or pick one: ' : 'Pick one: '}
      {shown.map((m, i) => (
        <span key={m.id}>
          {i > 0 && ' · '}
          <Link href={hrefWith(searchParams, { member: m.id })} replace scroll={false} className="hit-area prose-link">
            {m.name}
          </Link>
        </span>
      ))}
    </EmptyState>
  )
}

function LedgerList({
  ledger,
  member,
  kindLabel,
  searchParams,
}: {
  ledger: Awaited<ReturnType<typeof listAllTransactions>>
  member: MemberName | null
  kindLabel: string | null
  searchParams: SearchParams
}) {
  const backToNewestHref = newestHref(PATH, searchParams, 'before')
  return (
    <>
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
    </>
  )
}
