import { IntentLink } from '@/components/ui/intent-link'
import type { MemberSummary } from '@/lib/members/list-members'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { focusTarget } from '@/lib/pagination/row-id'
import { LocalTime } from '@/components/ui/local-time'
import { eyebrowClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { orderLabel, type MemberOrder, type MemberSort, type SortDir } from '@/lib/members/member-sort'
import { cn } from '@/lib/utils'

// Admin › Members is one table at every width (#399): columns under their headers from lg; below
// lg each row is the name and email, then one line of role, balance, net worth and when they
// joined, so each figure says what it is, and the header row is a line of sort links over the
// list (#418). The roles are explicit because the phone layout changes the elements' display,
// which can drop their implicit roles.
export const membersTableClass = 'w-full border-collapse max-lg:block'
const headClass = `${eyebrowClass} h-11 text-left align-middle max-lg:block max-lg:h-auto lg:pr-3 lg:last:pr-0`
const cellClass = 'lg:py-3 lg:pr-3 lg:align-top lg:last:pr-0'
const numberClass = 'lg:text-right lg:tabular-nums'
// Separates the phone line's figures; the table's columns do that from lg.
const dot = (
  <span aria-hidden="true" className="text-ink2 lg:hidden">
    {' · '}
  </span>
)

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const
// A column header that sorts the table by its column: a link, since the order lives in the URL,
// saying what a tap does next. The sorted column carries aria-sort and an arrow.
function SortHeader({
  sort,
  label,
  order,
  href,
  next,
  className,
}: {
  sort: MemberSort
  label: string
  order: MemberOrder
  href: string
  next: SortDir
  className?: string
}) {
  const current = order.sort === sort
  const Arrow = order.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th role="columnheader" scope="col" aria-sort={current ? ARIA_SORT[order.dir] : undefined} className={cn(headClass, className)}>
      <IntentLink
        href={href}
        aria-label={`${label}, sort ${orderLabel({ sort, dir: next })}`}
        replace
        scroll={false}
        className={cn(
          'pressable inline-flex min-h-11 items-center gap-1 no-underline hover:text-ink',
          current && 'text-ink',
        )}
      >
        {label}
        {current && <Arrow aria-hidden="true" className="size-3.5 shrink-0" />}
      </IntentLink>
    </th>
  )
}

// `sortHrefs` holds a link for each column that can sort this tab; Net worth can't on Removed.
export function MembersTableHead({
  order,
  sortHrefs,
}: {
  order: MemberOrder
  sortHrefs: Partial<Record<MemberSort, { href: string; next: SortDir }>>
}) {
  const header = (sort: MemberSort, label: string, className?: string) => {
    const link = sortHrefs[sort]
    return link ? (
      <SortHeader sort={sort} label={label} order={order} href={link.href} next={link.next} className={className} />
    ) : (
      <th role="columnheader" scope="col" className={cn(headClass, 'max-lg:hidden', className)}>
        {label}
      </th>
    )
  }
  return (
    <thead role="rowgroup" className="max-lg:block">
      <tr role="row" className="border-b border-line max-lg:flex max-lg:flex-wrap max-lg:gap-x-4">
        {header('name', 'Member')}
        <th role="columnheader" scope="col" className={cn(headClass, 'max-lg:hidden')}>
          Role
        </th>
        {header('balance', 'Balance', 'lg:text-right')}
        {header('net_worth', 'Net worth', 'lg:text-right')}
        {header('joined', 'Joined')}
      </tr>
    </thead>
  )
}

export const membersBodyClass = 'divide-y divide-line max-lg:flex max-lg:flex-col'

// One member, read-only: the name opens their Admin page, where the forms are (#254). Named by
// that name, so "Show more" focus announces it.
export function MemberRow({ member, domId, netWorth }: { member: MemberSummary; domId: string; netWorth: number | undefined }) {
  const titleId = `${domId}-name`
  return (
    <tr
      role="row"
      {...focusTarget(domId, titleId)}
      className="max-lg:flex max-lg:flex-wrap max-lg:items-baseline max-lg:py-3.5 max-lg:text-sm"
    >
      <td role="cell" className={`${cellClass} max-lg:mb-0.5 max-lg:basis-full max-lg:text-base`}>
        <div className="flex min-w-0 flex-col">
          <IntentLink
            id={titleId}
            href={`/admin/members/${member.id}`}
            transitionTypes={['nav-forward']}
            className="hit-area pressable self-start font-extrabold break-words text-ink"
          >
            {member.displayName}
          </IntentLink>
          {/* The only way an admin can match a Google account to a member (#195). */}
          {member.email && <span className="text-sm text-ink2 wrap-anywhere">{member.email}</span>}
        </div>
      </td>
      <td role="cell" className={`${cellClass} text-ink2`}>
        {/* A removed member's role is already back to Member, so Removed takes its place (#265). */}
        {member.removed ? 'Removed' : ROLE_LABELS[member.role]}
      </td>
      <td role="cell" className={`${cellClass} ${numberClass} whitespace-nowrap`}>
        {dot}
        <span className="font-extrabold">{formatDcAmount(member.balance)}</span>
        <span className="text-ink2 lg:hidden"> balance</span>
      </td>
      <td role="cell" className={`${cellClass} ${numberClass} whitespace-nowrap`}>
        {dot}
        {netWorth === undefined ? '—' : formatDcAmount(netWorth)}
        <span className="text-ink2 lg:hidden"> net worth</span>
      </td>
      <td role="cell" className={`${cellClass} whitespace-nowrap text-ink2`}>
        {dot}
        <span className="lg:hidden">Joined </span>
        {member.joinedAt ? <LocalTime iso={member.joinedAt} format="day" /> : '—'}
      </td>
    </tr>
  )
}
