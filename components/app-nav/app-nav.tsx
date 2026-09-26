'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { MotionConfig, motion } from 'motion/react'
import { BookOpen, ChartColumn, CircleDot, House, Layers, MessageSquareText, ShieldCheck, Trophy, type LucideIcon } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { Wordmark } from '@/components/brand/wordmark'
import { AnimatedText } from '@/components/ui/animated-text'
import { cn } from '@/lib/utils'
import { ADMIN_HREF, NAV_ITEMS, activeNavId, type NavId } from './nav-items'
import { ThemeToggle } from './theme-toggle'

const ICONS: Record<NavId, LucideIcon> = {
  home: House,
  markets: ChartColumn,
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
        <NumberFlow value={balance} suffix=" DC" />
      </AnimatedText>
    </span>
  )
}

function DesktopLink({
  href,
  label,
  active,
  count = 0,
  icon: Icon,
}: {
  href: string
  label: string
  active: boolean
  count?: number
  icon?: LucideIcon
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative isolate inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[15px] font-bold no-underline',
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
      {Icon && <Icon aria-hidden="true" className="size-[18px]" />}
      {label}
      {count > 0 && (
        <>
          {' '}
          <SlipCount count={count} />
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-lime px-1.5 text-xs font-extrabold text-on-lime',
              active && 'dark:bg-on-primary dark:text-primary',
            )}
          >
            {count}
          </span>
        </>
      )}
    </Link>
  )
}

export function AppNav({ balance, slipCount, isAdmin }: { balance: number; slipCount: number; isAdmin: boolean }) {
  const active = activeNavId(usePathname())
  const router = useRouter()

  useEffect(() => {
    // Layouts don't re-render on client navigation, so refresh when the member returns to the tab
    // to pick up balance/slip changes someone else made while they were away.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [router])

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 focus:text-ink focus:shadow-card"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 hidden h-[72px] shrink-0 items-center gap-5 border-b border-line bg-surface px-10 md:flex">
        <Wordmark />
        <nav aria-label="Primary" className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => (
            <DesktopLink
              key={item.id}
              href={item.href}
              label={item.label}
              active={active === item.id}
              count={item.id === 'parlays' ? slipCount : 0}
            />
          ))}
          {isAdmin && (
            <>
              <span aria-hidden="true" className="mx-1.5 h-6 w-px bg-line" />
              <DesktopLink href={ADMIN_HREF} label="Admin" active={active === 'admin'} icon={ShieldCheck} />
            </>
          )}
        </nav>
        <span className="grow" />
        <BalanceChip balance={balance} />
        <ThemeToggle />
      </header>

      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden">
        <Wordmark size="sm" />
        <span className="grow" />
        <BalanceChip balance={balance} />
        {isAdmin && (
          <Link
            href={ADMIN_HREF}
            aria-label="Admin"
            aria-current={active === 'admin' ? 'page' : undefined}
            className={cn(
              'inline-flex size-11 shrink-0 items-center justify-center rounded-control no-underline',
              active === 'admin' ? 'bg-lime text-on-lime' : 'text-ink hover:bg-sunk',
            )}
          >
            <ShieldCheck aria-hidden="true" className="size-[22px]" />
          </Link>
        )}
        <ThemeToggle />
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-3 md:hidden"
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
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-[14px] text-xs leading-[1.1] no-underline',
                isActive ? 'font-extrabold text-ink' : 'font-bold text-ink2',
              )}
            >
              <span
                className={cn(
                  'relative flex h-[30px] w-[52px] items-center justify-center rounded-full',
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
            </Link>
          )
        })}
      </nav>
    </MotionConfig>
  )
}
