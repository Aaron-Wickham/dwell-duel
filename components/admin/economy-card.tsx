import { ChevronDown } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { Skeleton, SkeletonCard, SkeletonScreen } from '@/components/ui/skeleton'
import { OPERATIONS_INCIDENTS_URL } from '@/lib/admin/docs-links'
import { monthLabel, type EconomySummary } from '@/lib/economy/summary'
import { cn } from '@/lib/utils'
import { figureClass } from '@/components/ui/page'
import { formatDcAmount, formatSignedDcAmount } from '@/lib/format/dc'

function Dc({ value }: { value: number }) {
  if (value === 0) return <span className="whitespace-nowrap text-ink2">{formatDcAmount(0)}</span>
  return (
    <span className={cn('font-extrabold whitespace-nowrap', value > 0 ? 'text-win' : 'text-loss')}>{formatSignedDcAmount(value)}</span>
  )
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
        <dd className="text-sm text-ink2">
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
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                <Dc value={s.added} />
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                {s.removed === null ? <span className="text-ink2">None</span> : <Dc value={-s.removed} />}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line">
            <th scope="row" className="py-2 pr-3">
              Net change
            </th>
            <td colSpan={2} className="py-2 text-right whitespace-nowrap">
              <Dc value={summary.monthAdded - summary.monthRemoved} />
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Folded, since it's the same every month; the table reads without it (C-42). */}
      <details className="group">
        {/* flex drops the browser's disclosure marker, so the chevron says this opens. */}
        <summary className="pressable flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold">
          How each source is counted
          <ChevronDown
            aria-hidden="true"
            className="size-5 shrink-0 text-ink2 transition-transform duration-(--duration-fast) group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <p className="pb-1 text-sm text-ink2">
          Market maker is what the house paid winners, less every stake it took. Each winning share pays 1
          DC, rounded down, so payout rounding is the fractions of a DC that rounding keeps (an override can
          pay some back). Seed payouts appear only for older results, which counted the seed. Parlays remove
          the stakes they lose, and overrides take back earlier payouts.
        </p>
      </details>

      {reconciles ? (
        <p className="text-sm text-ink2">
          Reconciles with the ledger: everything ever added, less everything removed, is what’s in circulation.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-extrabold text-loss">
            {summary.discrepancy !== 0 && `Doesn’t reconcile with the ledger: off by ${formatDcAmount(summary.discrepancy)}.`}
            {summary.discrepancy !== 0 && summary.unclassified > 0 && ' '}
            {summary.unclassified > 0 &&
              `${summary.unclassified} ledger ${summary.unclassified === 1 ? 'row has' : 'rows have'} a type the panel doesn’t count.`}
          </p>
          {/* What it means and what to do, since Adjust balance is one tap away and the wrong fix (ADM-1). */}
          <p className="text-sm text-ink2">
            Coins have moved outside the rules. Don’t adjust balances to cover it: follow the{' '}
            <a href={OPERATIONS_INCIDENTS_URL} target="_blank" rel="noreferrer" className="hit-area prose-link">
              incident steps in the Operations guide <span className="sr-only">(opens GitHub in a new tab)</span>
            </a>
            .
          </p>
        </div>
      )}
    </SectionCard>
  )
}

// One skeleton line: a box as tall as the text's line, with a bar the text's height inside it.
function Line({ className, bar }: { className: string; bar: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <Skeleton className={bar} />
    </div>
  )
}

// The rows every month has: Seed payouts shows only in a month an older result was paid.
const ALWAYS_SHOWN_SOURCES = 6

// The card's blocks at their real heights at 375 and 1280, so the ledger under it doesn't move
// when the figures land: the heading, the figure and its caption (two lines on a phone), the
// table's caption, header, a row per source and its total, the disclosure's 44px summary and the
// reconcile line (three lines on a phone, two at md, one from lg). A failed check is a line
// shorter or longer, which is rare enough to leave.
export function EconomyCardSkeleton() {
  return (
    <SkeletonScreen name="admin-economy">
      <SkeletonCard>
        <Line className="h-6 md:h-[26px]" bar="h-5 w-28" />
        <div className="flex flex-col gap-1">
          <Line className="h-5" bar="h-3.5 w-24" />
          <Line className="h-[30px] md:h-[35px]" bar="h-6 w-32 md:h-7" />
          <Line className="h-5" bar="h-3.5 w-full max-w-[420px]" />
          <Line className="h-5 md:hidden" bar="h-3.5 w-1/2" />
        </div>
        <div className="flex flex-col">
          <Line className="h-6 pb-1" bar="h-3.5 w-44" />
          <Line className="h-[37px] border-b border-line" bar="h-3.5 w-full" />
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: ALWAYS_SHOWN_SOURCES }, (_, i) => (
              <Line key={i} className="h-10" bar="h-4 w-full" />
            ))}
          </div>
          <Line className="h-[41px] border-t border-line" bar="h-4 w-full" />
        </div>
        <Line className="h-11" bar="h-4 w-52" />
        <div className="flex flex-col">
          <Line className="h-5" bar="h-3.5 w-full" />
          <Line className="h-5 lg:hidden" bar="h-3.5 w-full" />
          <Line className="h-5 md:hidden" bar="h-3.5 w-1/3" />
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}
