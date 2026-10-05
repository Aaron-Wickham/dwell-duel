import Link from 'next/link'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { ageLabel, isOldEntry } from '@/lib/social/relative-time'
import { LocalTime } from '@/components/ui/local-time'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { formatSignedDcAmount } from '@/lib/format/dc'

// `showMember` is off where the page is already about that one member.
export function LedgerRow({ entry, domId, showMember = true }: { entry: LedgerEntry; domId?: string; showMember?: boolean }) {
  const amountClass = entry.amount > 0 ? 'text-win' : entry.amount < 0 ? 'text-loss' : 'text-ink2'

  return (
    <li {...focusTarget(domId)} className="flex items-start gap-3 py-3.5">
      <p className="min-w-0 grow break-words">
        {showMember && (
          <>
            <Link href={`/members/${entry.profileId}`} transitionTypes={['nav-forward']}>{entry.memberName}</Link>:{' '}
          </>
        )}
        <span className={cn('font-extrabold whitespace-nowrap tabular-nums', amountClass)}>{formatSignedDcAmount(entry.amount)}</span>{' '}
        — {entry.context}
      </p>
      <span className="whitespace-nowrap pt-0.5 text-sm text-ink2">
        {isOldEntry(entry.createdAt) ? <LocalTime iso={entry.createdAt} format="day" /> : ageLabel(entry.createdAt)}
      </span>
    </li>
  )
}
