import Link from 'next/link'
import { cn } from '@/lib/utils'
import { D_PATH, LEAF_ANGLES, LEAF_PATH } from './symbol-paths'

export function DwellDuelSymbol({ size, className, id }: { size: number; className?: string; id?: string }) {
  return (
    <svg id={id} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <g transform="translate(50 50) translate(-55.5 -41.5)">
        <g className="fill-lime">
          {LEAF_ANGLES.map((angle) => (
            <path key={angle} d={LEAF_PATH} transform={`rotate(${angle} 50 50)`} />
          ))}
        </g>
        <path
          className="fill-sym-d"
          fillRule="evenodd"
          d={D_PATH}
        />
      </g>
    </svg>
  )
}

// The D's bottom edge sits at 82.5% of the symbol's box, so centring the box centres it a little
// low; these lift it until it meets the wordmark's baseline (measured in e2e/brand.spec.ts, which
// keeps them honest). Shared with the sign-in pages' static wordmark.
export const WORDMARK_SYMBOL_SIZE = { sm: 28, md: 32 } as const
export const WORDMARK_SYMBOL_LIFT = { sm: '-translate-y-[2.6px]', md: '-translate-y-[3.15px]' } as const

// `symbolBelowLg` drops the name below lg, where the desktop header has no room for it, and
// `symbolOnNarrow` below 360px, for a phone header with an extra button; the link keeps its
// accessible name either way.
export function Wordmark({
  size = 'md',
  href = '/',
  symbolBelowLg = false,
  symbolOnNarrow = false,
  current = false,
}: {
  size?: 'sm' | 'md'
  href?: string
  symbolBelowLg?: boolean
  symbolOnNarrow?: boolean
  current?: boolean
}) {
  return (
    <Link
      href={href}
      aria-label="DwellDuel home"
      aria-current={current ? 'page' : undefined}
      className="pressable inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] pr-1 no-underline"
    >
      <DwellDuelSymbol size={WORDMARK_SYMBOL_SIZE[size]} className={WORDMARK_SYMBOL_LIFT[size]} />
      <WordmarkName
        className={cn(size === 'sm' ? 'text-[18px]' : 'text-[21px]', symbolBelowLg && 'max-lg:hidden', symbolOnNarrow && 'max-[359px]:hidden')}
      />
    </Link>
  )
}

// The name beside the symbol, sized by its caller.
export function WordmarkName({ className }: { className?: string }) {
  return (
    <span className={cn('whitespace-nowrap font-extrabold uppercase leading-none tracking-[-0.03em]', className)}>
      <span className="text-wm-a">Dwell</span>
      <span className="text-wm-b">Duel</span>
    </span>
  )
}
