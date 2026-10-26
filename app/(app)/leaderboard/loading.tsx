import { MonthSkeleton, NetWorthSkeleton } from './skeletons'
import { BoardSkeleton } from './tab-skeleton'

export default function Loading() {
  return <BoardSkeleton month={<MonthSkeleton />} all={<NetWorthSkeleton />} />
}
