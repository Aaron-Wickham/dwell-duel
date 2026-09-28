'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MotionConfig, motion } from 'motion/react'
import { BookOpen, ChartColumn, CircleDot, House, Layers, MessageSquareText, ShieldCheck, Ticket, Trophy, type LucideIcon } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { BetaBadge } from '@/components/brand/beta-badge'
import { Wordmark } from '@/components/brand/wordmark'
import { AnimatedText } from '@/components/ui/animated-text'
import { NavPendingHint } from '@/components/nav/nav-pending-hint'
import { haptics } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { ADMIN_HREF, NAV_ITEMS, activeNavId, type NavId } from './nav-items'
import { useSlipCount } from './slip-count'
import { ThemeToggle } from './theme-toggle'

const ICONS: Record<NavId, LucideIcon> = {
  home: House,
  markets: ChartColumn,
  bets: Ticket,
  parlays: Layers,
  tasks: BookOpen,
  feed: MessageSquareText,
  leaderboard: Trophy,
  admin: ShieldCheck,
}

function SlipCount({ count }: { count: number }) {
  return <span className="sr-only">{`(${count})`}</span>
}

function BalanceChip({ balance }: { balance: number }) {
  return (
    <span className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-full bg-gold-soft pr-2.5 pl-1.5 text-[15px] font-extrabold tabular-nums text-gold md:gap-1.5 md:pr-3 md:pl-2">
      <CircleDot aria-hidden="true" className="size-4 md:size-[18px]" />
      <AnimatedText plainText={`Balance ${balance} DC`}>
        <NumberFlow value={balance} locales="en-US" format={{ useGrouping: false }} suffix=" DC" />
      </AnimatedText>
    </span>
  )
}

// Below xl every label won't fit beside the wordmark, balance and toggle (an admin's row needs
// ~1180px), so each link is a 44px icon until then, its label kept for assistive tech and as a
// hover tooltip. `iconWithLabel` keeps the icon beside the label from xl too, as Admin's does.
function DesktopLink({
  href,
  label,
  active,
  count = 0,
  icon: Icon,
  iconWithLabel = false,
  transitionTypes,
}: {
  href: string
  label: string
  active: boolean
  count?: number
  icon: LucideIcon
  iconWithLabel?: boolean
  transitionTypes?: string[]
}) {
  return (
    <Link
      href={href}
      transitionTypes={transitionTypes}
      aria-current={active ? 'page' : undefined}
      title={label}
      className={cn(
        'pressable relative isolate inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-bold no-underline xl:px-3.5',
        active ? 'text-on-primary' : 'text-ink2 hover:bg-sunk hover:text-ink',
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full bg-primary"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
        />
      )}
      <Icon aria-hidden="true" className={cn('size-5 xl:size-[18px]', !iconWithLabel && 'xl:hidden')} />
      <span className="max-xl:sr-only">{label}</span>
      {count > 0 && (
        <>
          {' '}
          <SlipCount count={count} />
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-lime px-1.5 text-xs font-extrabold text-on-lime',
              // Over the icon's corner while the link is icon-only, as on the phone tab bar.
              'max-xl:absolute max-xl:-top-1 max-xl:-right-1 max-xl:h-5 max-xl:min-w-5 max-xl:border-2 max-xl:border-surface max-xl:px-[5px] max-xl:text-[11px]',
              active && 'dark:bg-on-primary dark:text-primary',
            )}
          >
            {count}
          </span>
        </>
      )}
      <NavPendingHint className="inset-x-3.5 bottom-1 h-0.5" />
    </Link>
  )
}

export function AppNav({ balance, isAdmin }: { balance: number; isAdmin: boolean }) {
  const active = activeNavId(usePathname())
  const { count: slipCount } = useSlipCount()

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 focus:text-ink focus:shadow-card"
      >
        Skip to content
      </a>
      <header
        style={{ viewTransitionName: 'app-header' }}
        className="no-callout sticky top-(--safe-top) z-30 hidden h-[72px] shrink-0 items-center gap-3 border-b border-line bg-surface px-6 md:flex xl:gap-5 xl:px-10"
      >
        <div className="flex shrink-0 items-center gap-2">
          <Wordmark symbolBelowLg />
          <BetaBadge />
        </div>
        <nav aria-label="Primary" className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => (
            <DesktopLink
              key={item.id}
              href={item.href}
              label={item.label}
              icon={ICONS[item.id]}
              active={active === item.id}
              count={item.id === 'parlays' ? slipCount : 0}
            />
          ))}
          {isAdmin && (
            <>
              <span aria-hidden="true" className="mx-1.5 h-6 w-px bg-line" />
              <DesktopLink
                href={ADMIN_HREF}
                label="Admin"
                active={active === 'admin'}
                icon={ShieldCheck}
                iconWithLabel
                transitionTypes={['nav-forward']}
              />
            </>
          )}
        </nav>
        <span className="grow" />
        <BalanceChip balance={balance} />
        <ThemeToggle />
      </header>

      <header
        style={{ viewTransitionName: 'app-topbar' }}
        className="no-callout sticky top-(--safe-top) z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden"
      >
        {/* At 375px with a five-digit balance there's no width to spare beside the wordmark, so the
            badge tucks under its right end instead. It's decorative, so taps pass through to the link. */}
        <div className="relative shrink-0">
          <Wordmark size="sm" />
          <BetaBadge className="pointer-events-none absolute right-1 -bottom-1.5 h-3.5 px-1.5 text-[9px]" />
        </div>
        <span className="grow" />
        <BalanceChip balance={balance} />
        {isAdmin && (
          <Link
            href={ADMIN_HREF}
            transitionTypes={['nav-forward']}
            aria-label="Admin"
            aria-current={active === 'admin' ? 'page' : undefined}
            className={cn(
              'pressable relative inline-flex size-11 shrink-0 items-center justify-center rounded-control no-underline',
              active === 'admin' ? 'bg-lime text-on-lime' : 'text-ink hover:bg-sunk',
            )}
          >
            <ShieldCheck aria-hidden="true" className="size-[22px]" />
            <NavPendingHint className="inset-x-3 bottom-1 h-0.5" />
          </Link>
        )}
        <ThemeToggle />
      </header>

      <nav
        aria-label="Primary"
        style={{ viewTransitionName: 'app-tabbar' }}
        className="no-callout fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-[calc(12px+var(--safe-bottom))] md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.id]
          const isActive = active === item.id
          const count = item.id === 'parlays' ? slipCount : 0
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.shortLabel === item.label ? undefined : item.label}
              onClick={haptics.tap}
              className={cn(
                'pressable relative flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-[14px] text-xs leading-[1.1] no-underline',
                isActive ? 'font-extrabold text-ink' : 'font-bold text-ink2',
              )}
            >
              <span
                className={cn(
                  'relative flex h-[30px] w-11 items-center justify-center rounded-full',
                  isActive && 'bg-lime text-on-lime',
                )}
              >
                <Icon aria-hidden="true" className="size-[22px]" />
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-primary px-[5px] text-[11px] font-extrabold text-on-primary"
                  >
                    {count}
                  </span>
                )}
              </span>
              <span>
                {item.shortLabel}
                {count > 0 && (
                  <>
                    {' '}
                    <SlipCount count={count} />
                  </>
                )}
              </span>
              <NavPendingHint className="bottom-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2" />
            </Link>
          )
        })}
      </nav>
    </MotionConfig>
  )
}
