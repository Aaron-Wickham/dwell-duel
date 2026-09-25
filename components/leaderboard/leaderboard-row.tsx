import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function LeaderboardRow({
  rank,
  name,
  balance,
  isMe,
  href,
}: {
  rank: number
  name: string
  balance: number
  isMe: boolean
  href: string
}) {
  return (
    <li className={cn('flex min-h-[60px] items-center gap-3 rounded-[12px] px-2.5 py-2.5 md:px-3.5', isMe && 'bg-acc-soft')}>
      <span
        aria-label={`Rank ${rank}`}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-control text-lg font-extrabold tabular-nums',
          rank === 1 ? 'bg-lime text-on-lime' : 'bg-sunk text-ink',
        )}
      >
        {rank}
      </span>
      <Avatar name={name} />
      <span className="grow text-[17px] font-extrabold">
        <Link href={href}>{name}</Link>
        {isMe && <span className="font-semibold text-ink2"> (you)</span>}
      </span>
      <span className="text-[17px] font-extrabold tabular-nums">{balance} DC</span>
    </li>
  )
}
