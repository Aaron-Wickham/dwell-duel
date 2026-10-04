import { SectionCard } from '@/components/ui/section-card'
import { monthLabel, type EconomySummary } from '@/lib/economy/summary'
import { cn } from '@/lib/utils'
import { figureClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'

function Dc({ value, sign }: { value: number; sign: '+' | '−' }) {
  if (value === 0) return <span className="text-ink2">0 DC</span>
  return (
    <span className={cn('font-extrabold', sign === '+' ? 'text-win' : 'text-loss')}>
      {sign}
      {formatDcAmount(value)}
    </span>
  )
}

function Net({ value }: { value: number }) {
  if (value === 0) return <span className="text-ink2">0 DC</span>
  return <Dc value={Math.abs(value)} sign={value > 0 ? '+' : '−'} />
}

// The owner's view of the whole supply: what exists now, and where this month's DC came from.
export function EconomyCard({ summary }: { summary: EconomySummary }) {
  const month = monthLabel(summary.monthStart)
  const reconciles = summary.discrepancy === 0 && summary.unclassified === 0

  return (
    <SectionCard title="Economy" titleId="economy-title">
      <dl className="flex flex-col gap-1">
        <dt className="text-sm text-ink2">In circulation</dt>
        <dd className={cn(figureClass, 'whitespace-nowrap')}>{formatDcAmount(summary.inCirculation)}</dd>
        <dd className="text-sm text-ink2 tabular-nums">
          {formatDcAmount(summary.balances)} in balances · {formatDcAmount(summary.betsAtStake)} in open bets · {formatDcAmount(summary.parlaysAtStake)} in
          open parlays
        </dd>
      </dl>

      <table className="w-full text-left tabular-nums">
        <caption className="pb-1 text-left text-sm text-ink2">{month}, Eastern time</caption>
        <thead>
          <tr className="border-b border-line text-sm text-ink2">
            <th scope="col" className="py-2 pr-3 font-normal">
              Source
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">
              Added
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              Removed
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {summary.sources.map((s) => (
            <tr key={s.key}>
              <th scope="row" className="py-2 pr-3 font-normal">
                {s.label}
              </th>
              <td className="py-2 pr-3 text-right">
                <Dc value={s.added} sign="+" />
              </td>
              <td className="py-2 text-right">
                {s.removed === null ? <span className="text-ink2">—</span> : <Dc value={s.removed} sign="−" />}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line">
            <th scope="row" className="py-2 pr-3">
              Net change
            </th>
            <td colSpan={2} className="py-2 text-right">
              <Net value={summary.monthAdded - summary.monthRemoved} />
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="text-sm text-ink2">
        Winners split exactly a market’s real stakes, rounded down, so payout rounding is the fractions of
        a DC that rounding keeps (an override can pay some back). Seed payouts appear only for older
        results, which counted the seed. Parlays remove the stakes they lose, and overrides take back
        earlier payouts.
      </p>

      {reconciles ? (
        <p className="text-sm text-ink2">
          Reconciles with the ledger: everything ever added, less everything removed, is what’s in circulation.
        </p>
      ) : (
        <p className="text-sm font-extrabold text-loss">
          {summary.discrepancy !== 0 && `Doesn’t reconcile with the ledger: off by ${formatDcAmount(summary.discrepancy)}.`}
          {summary.discrepancy !== 0 && summary.unclassified > 0 && ' '}
          {summary.unclassified > 0 &&
            `${summary.unclassified} ledger ${summary.unclassified === 1 ? 'row has' : 'rows have'} a type the panel doesn’t count.`}
        </p>
      )}
    </SectionCard>
  )
}
