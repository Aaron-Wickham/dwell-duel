import { requireUser } from '@/lib/auth/require-user'
import type { MarketDetail } from '@/lib/markets/get-market'
import { getMarketPosition, type PositionKeys } from '@/lib/markets/position'
import { ContentReveal } from '@/components/nav/page-transition'
import { PositionCard } from '@/components/markets/position-card'

// Rendered only when my_market_position found something, so most viewers never wait on it.
// Exported for the component tests, which render this async section directly.
export async function MarketPosition({ market, keys, now }: { market: MarketDetail; keys: PositionKeys; now: number }) {
  const { supabase } = await requireUser()
  const position = await getMarketPosition(supabase, market, keys, now)
  if (position.bets.length === 0 && position.legs.length === 0) return null
  return (
    <ContentReveal>
      <PositionCard
        position={position}
        resolvedAt={market.status === 'resolved' ? market.resolvedAt : null}
        className="lg:col-start-2 lg:row-start-1 lg:mb-7"
      />
    </ContentReveal>
  )
}
