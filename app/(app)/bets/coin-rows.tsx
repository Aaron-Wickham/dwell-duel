import type { MyCoinEntry } from '@/lib/ledger/my-transactions'
import { coinTime, groupByDay } from '@/lib/ledger/coin-days'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { eyebrowClass } from '@/components/ui/page'
import { formatSignedDcAmount } from '@/lib/format/dc'

// Divided rows under a heading per day (#418), each row giving only its time, since the heading
// gives the day.
export function CoinRows({ entries, rowIdPrefix, now }: { entries: MyCoinEntry[]; rowIdPrefix: string; now: Date }) {
  return (
    <div className="flex flex-col gap-5">
      {groupByDay(entries, now).map((day) => (
        <div key={day.key} className="flex flex-col">
          <h3 className={cn(eyebrowClass, 'border-b border-line pb-2')}>{day.label}</h3>
          <ul className="flex flex-col divide-y divide-line">
            {day.rows.map((e) => {
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
                      <time dateTime={e.createdAt}>{coinTime(e.createdAt)}</time>
                    </p>
                  </div>
                  <span className={cn('shrink-0 font-extrabold whitespace-nowrap tabular-nums', amountClass)}>
                    {formatSignedDcAmount(e.amount)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
