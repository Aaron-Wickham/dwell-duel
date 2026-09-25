import Link from 'next/link'
import { cn } from '@/lib/utils'

const LEAF = 'M50 3 C60 11 57 24 48 27 C41 20 43 10 50 3 Z'

export function DwellDuelSymbol({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <g transform="translate(50 50) translate(-55.5 -41.5)">
        <g fill="#72DB2B">
          {[30, 50, 70, 90].map((angle) => (
            <path key={angle} d={LEAF} transform={`rotate(${angle} 50 50)`} />
          ))}
        </g>
        <path
          className="fill-sym-d"
          fillRule="evenodd"
          d="M14 26 H42 A24 24 0 0 1 42 74 H14 Z M28 40 H42 A10 10 0 0 1 42 60 H28 Z"
        />
      </g>
    </svg>
  )
}

export function Wordmark({ size = 'md', href = '/' }: { size?: 'sm' | 'md'; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="DwellDuel home"
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] pr-1 no-underline"
    >
      <DwellDuelSymbol size={size === 'sm' ? 28 : 32} />
      <span
        className={cn(
          'whitespace-nowrap font-extrabold uppercase leading-none tracking-[-0.03em]',
          size === 'sm' ? 'text-[18px]' : 'text-[21px]',
        )}
      >
        <span className="text-wm-a">Dwell</span>
        <span className="text-wm-b">Duel</span>
      </span>
    </Link>
  )
}
