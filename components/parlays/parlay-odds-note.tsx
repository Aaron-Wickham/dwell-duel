import { MAX_LEG_ODDS, MAX_PAYOUT } from '@/lib/parlays/odds'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { formatDcAmount } from '@/lib/format/dc'

type NoteParlay = Pick<ParlayView, 'fixed' | 'converted' | 'lockedAtPlacement' | 'capped' | 'maxMultiplier' | 'stake'>

// The parlay page's line under "How it adds up": where each pick's odds came from, and the caps a
// pool parlay (or one converted from the pools at release, 0105) still pays under.
export function ParlayOddsNote({ parlay, dropped }: { parlay: NoteParlay; dropped: number }) {
  const caps = (
    <>
      {parlay.capped ? `, up to a ${parlay.maxMultiplier}× cap` : ''}. A win pays at most {formatDcAmount(MAX_PAYOUT)}
      {parlay.stake > MAX_PAYOUT ? ', or its stake back, since that was more' : ''}.
    </>
  )
  return (
    <p className="text-sm text-ink2">
      {parlay.converted ? (
        <>
          Each pick’s odds came from the other members’ money on its market, and were fixed by the time DwellDuel switched
          to fixed payouts in October 2026. They multiply together, up to a {parlay.maxMultiplier}× cap, and a win pays at
          most {formatDcAmount(MAX_PAYOUT)}{parlay.stake > MAX_PAYOUT ? ', or its stake back, since that was more' : ''}: the old caps
          still apply.
        </>
      ) : parlay.fixed ? (
        <>
          The stake was split evenly across the picks, and each pick’s odds were fixed when the parlay was placed, from
          what its share bought at its market’s price. They multiply together.
        </>
      ) : (
        <>
          {parlay.lockedAtPlacement
            ? 'Each pick’s odds were locked when the parlay was placed'
            : `Each pick’s odds are set when its market closes, from the other members’ money on it, at most ${MAX_LEG_ODDS}× a pick (a ~ marks one still open)`}
          , and they multiply together{caps}
        </>
      )}
      {dropped > 0 ? ` ${dropped} called-off ${dropped === 1 ? 'pick was' : 'picks were'} left out and the rest carried on.` : ''}
    </p>
  )
}
