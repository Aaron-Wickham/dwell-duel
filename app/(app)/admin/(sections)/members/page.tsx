import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { countMembers, listMembersByNetWorth, listMembersByValue, listMembersPage } from '@/lib/members/list-members'
import { MEMBER_SORTS, canSort, nextOrder, orderLabel, orderParams, readMemberOrder, type MemberOrder } from '@/lib/members/member-sort'
import { readNetWorths } from '@/lib/members/net-worth'
import { readValuePageParams } from '@/lib/pagination/value-cursor'
import type { DbClient } from '@/lib/supabase/database'
import { newestHref, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import { readNamePageParams } from '@/lib/pagination/name-cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { readSearchQuery } from '@/lib/search/query'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { ListSection } from '@/components/ui/list-section'
import { SearchField } from '@/components/ui/search-field'
import { SearchSummary } from '@/components/ui/search-summary'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { SubNav } from '@/components/ui/sub-nav'
import { ContentReveal } from '@/components/nav/page-transition'
import { MemberRow, MembersTableHead, membersBodyClass, membersTableClass } from '@/app/(app)/admin/members/member-row'

const PATH = '/admin/members'
const ROW_ID_PREFIX = 'member'

// The page's own URL with some of its params changed: a tab, search or sort starts its list from the top.
function hrefWith(searchParams: SearchParams, changes: Record<string, string | null>): string {
  const query = new URLSearchParams()
  for (const key of ['q', 'show', 'sort', 'dir']) {
    const value = key in changes ? changes[key] : searchParams[key]
    if (typeof value === 'string' && value !== '') query.set(key, value)
  }
  const search = query.toString()
  return search ? `${PATH}?${search}` : PATH
}

async function readPage(supabase: DbClient, searchParams: SearchParams, query: string, removed: boolean, order: MemberOrder) {
  if (order.sort === 'name') {
    const list = await listMembersPage(supabase, { query, removed, page: readNamePageParams(searchParams, 'after') })
    return { list, netWorths: await readNetWorths(supabase, list.rows.map((m) => m.id)) }
  }
  const ascending = order.dir === 'asc'
  if (order.sort === 'net_worth') {
    const list = await listMembersByNetWorth(supabase, { query, ascending, page: readValuePageParams(searchParams, 'after', 'integer') })
    return { list, netWorths: list.netWorths }
  }
  const column = order.sort === 'balance' ? 'balance' : 'joined_at'
  const page = readValuePageParams(searchParams, 'after', column === 'balance' ? 'integer' : 'timestamp')
  const list = await listMembersByValue(supabase, { query, removed, column, ascending, page })
  return { list, netWorths: await readNetWorths(supabase, list.rows.map((m) => m.id)) }
}

export default async function AdminMembersPage(props: PageProps<'/admin/members'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!atLeast(await getRole(supabase), 'admin')) redirect('/admin/tasks')

  const query = readSearchQuery(searchParams.q)
  const removed = searchParams.show === 'removed'
  const order = readMemberOrder(searchParams, removed)
  const [{ list, netWorths }, counts] = await Promise.all([readPage(supabase, searchParams, query, removed, order), countMembers(supabase, query)])
  const backToStartHref = newestHref(PATH, searchParams, 'after')
  const tabCount = removed ? counts.removed : counts.active
  const sortHrefs = Object.fromEntries(
    MEMBER_SORTS.filter((sort) => canSort(sort, removed)).map((sort) => {
      const next = nextOrder(order, sort)
      return [sort, { href: hrefWith(searchParams, orderParams(next)), next: next.dir }]
    }),
  )
  const keep: Record<string, string> = {}
  for (const [key, value] of Object.entries({ show: removed ? 'removed' : null, ...orderParams(order) })) if (value) keep[key] = value

  return (
    <ContentReveal>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="min-w-0 lg:max-w-[520px] lg:grow">
            <SearchField
              action={PATH}
              label="Search members"
              placeholder="Name or email"
              value={query}
              keep={keep}
            />
          </div>
          <SubNav
            label="Show members"
            items={[
              { href: hrefWith(searchParams, { show: null }), label: `Active (${counts.active.toLocaleString('en-US')})`, current: !removed },
              { href: hrefWith(searchParams, { show: 'removed' }), label: `Removed (${counts.removed.toLocaleString('en-US')})`, current: removed },
            ]}
          />
        </div>
        {query && (
          <SearchSummary count={tabCount} noun={['member', 'members']} query={query} clearHref={hrefWith(searchParams, { q: null })} />
        )}
        <ShowMoreFocus />
        {/* The section's only content, so its table sits on the page (D2); divided rows on a phone (#399). */}
        <ListSection
          title={removed ? 'Removed members' : 'Members'}
          titleId="members-title"
          description={removed ? 'They can’t sign in and aren’t ranked. Their coins, bets and history stay.' : undefined}
        >
          {list.windowed && list.rows.length > 0 && (
            <div className="flex flex-col">
              <BackToNewest href={backToStartHref} />
            </div>
          )}
          {list.rows.length === 0 ? (
            <div>
              {list.windowed ? (
                <NothingOlder href={backToStartHref} />
              ) : query ? (
                <EmptyState title={`No ${removed ? 'removed members' : 'members'} match “${query}”.`}>
                  Try part of their name or email.
                </EmptyState>
              ) : removed ? (
                <EmptyState title="Nobody has been removed." />
              ) : (
                <EmptyState title="No members yet." />
              )}
            </div>
          ) : (
            <table role="table" className={membersTableClass}>
              <caption className="sr-only">
                {removed ? 'Removed members' : 'Members'}, {orderLabel(order)}
              </caption>
              <MembersTableHead order={order} sortHrefs={sortHrefs} />
              <tbody role="rowgroup" className={membersBodyClass}>
                {list.rows.map((m) => (
                  <MemberRow key={m.id} member={m} domId={rowDomId(ROW_ID_PREFIX, m.id)} netWorth={netWorths.get(m.id)} />
                ))}
              </tbody>
            </table>
          )}
          {list.next && (
            <div className="flex flex-col">
              <ShowMore
                href={showMoreHref(PATH, searchParams, 'after', list.next)}
                fresh={list.next.kind === 'window'}
                focusId={rowDomId(ROW_ID_PREFIX, list.next.firstId)}
              />
            </div>
          )}
        </ListSection>
      </div>
    </ContentReveal>
  )
}
