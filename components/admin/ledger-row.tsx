import Link from 'next/link'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { ageLabel } from '@/lib/social/relative-time'
import { cn } from '@/lib/utils'

export function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const credit = entry.amount >= 0

  return (
    <li className="flex items-start gap-3 py-3.5">
      <p className="min-w-0 grow">
        <Link href={`/members/${entry.profileId}`}>{entry.memberName}</Link>:{' '}
        <span className={cn('font-extrabold tabular-nums', credit ? 'text-win' : 'text-loss')}>
          {credit ? '+' : '−'}
          {Math.abs(entry.amount)} DC
        </span>{' '}
        — {entry.type}
        {entry.reason && ` — “${entry.reason}”`}
      </p>
      <span className="whitespace-nowrap pt-0.5 text-sm text-ink2">{ageLabel(entry.createdAt)}</span>
    </li>
  )
}
