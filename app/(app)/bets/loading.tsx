import { BetsSkeleton, CoinsSkeleton } from './skeletons'
import { TabSkeleton } from './tab-skeleton'

export default function Loading() {
  return <TabSkeleton coins={<CoinsSkeleton />} bets={<BetsSkeleton />} />
}
