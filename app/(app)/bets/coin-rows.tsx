import type { MyCoinEntry } from '@/lib/ledger/my-transactions'
import { LocalTime } from '@/components/ui/local-time'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'

export function CoinRows({ entries, rowIdPrefix }: { entries: MyCoinEntry[]; rowIdPrefix: string }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {entries.map((e) => {
        const sign = e.amount > 0 ? '+' : e.amount < 0 ? '−' : ''
        const amountClass = e.amount > 0 ? 'text-win' : e.amount < 0 ? 'text-loss' : 'text-ink2'
        return (
          <li
            key={e.id}
            {...focusTarget(rowDomId(rowIdPrefix, e.id))}
            className="flex items-start justify-between gap-3 py-3"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-bold break-words">{e.label}</p>
              <p className="text-sm text-ink2">
                <LocalTime iso={e.createdAt} format="dateTime" />
              </p>
            </div>
            <span className={cn('shrink-0 font-extrabold whitespace-nowrap tabular-nums', amountClass)}>
              {sign}
              {Math.abs(e.amount)} DC
            </span>
          </li>
        )
      })}
    </ul>
  )
}
