import { IntentLink } from '@/components/ui/intent-link'
import type { MemberSummary } from '@/lib/members/list-members'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { focusTarget } from '@/lib/pagination/row-id'
import { LocalTime } from '@/components/ui/local-time'
import { eyebrowClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'

// Admin › Members is one table at every width (#399): columns under their headers from lg; below
// lg each row is the name and email, then one line of role, balance, net worth and when they
// joined, so the headers are hidden and each figure says what it is. The roles are explicit
// because the phone layout changes the elements' display, which can drop their implicit roles.
export const membersTableClass = 'w-full border-collapse max-lg:block'
const headClass = `${eyebrowClass} py-2.5 pr-3 text-left last:pr-0`
const cellClass = 'lg:py-3 lg:pr-3 lg:align-top lg:last:pr-0'
const numberClass = 'lg:text-right lg:tabular-nums'
// Separates the phone line's figures; the table's columns do that from lg.
const dot = (
  <span aria-hidden="true" className="text-ink2 lg:hidden">
    {' · '}
  </span>
)

export function MembersTableHead() {
  return (
    <thead role="rowgroup" className="max-lg:hidden">
      <tr role="row" className="border-b border-line">
        <th role="columnheader" scope="col" className={headClass}>
          Member
        </th>
        <th role="columnheader" scope="col" className={headClass}>
          Role
        </th>
        <th role="columnheader" scope="col" className={`${headClass} text-right`}>
          Balance
        </th>
        <th role="columnheader" scope="col" className={`${headClass} text-right`}>
          Net worth
        </th>
        <th role="columnheader" scope="col" className={headClass}>
          Joined
        </th>
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
