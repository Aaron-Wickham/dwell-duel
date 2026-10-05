'use client'

import { IntentLink } from '@/components/ui/intent-link'
import { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useLayoutEffect, useState } from 'react'
import { LazyMotion, MotionConfig } from 'motion/react'
import * as m from 'motion/react-m'
import { BookOpen, ChartColumn, House, Ticket, Trophy, type LucideIcon } from 'lucide-react'
import { Wordmark } from '@/components/brand/wordmark'
import { AnimatedText } from '@/components/ui/animated-text'
import { NavPendingHint } from '@/components/nav/nav-pending-hint'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { haptics } from '@/lib/haptics'
import { PILL_TRANSITION } from '@/lib/ui/motion'
import { useMotionSettingReduced } from '@/lib/ui/reduced-motion'
import { cn } from '@/lib/utils'
import { BalanceNumber } from './balance-number'
import { NAV_ITEMS, activeNavId, tabAriaLabel, type NavId } from './nav-items'
import { ProfileMenu, type NavMember } from './profile-menu'
import { uiTextClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'

const loadMotionFeatures = () => import('@/lib/ui/motion-features').then((mod) => mod.default)

const ICONS: Record<NavId, LucideIcon> = {
  home: House,
  markets: ChartColumn,
  bets: Ticket,
  tasks: BookOpen,
  leaderboard: Trophy,
}

type ReportPending = (href: string, pending: boolean) => void

// Tells AppNav which of its links is navigating, so the pill can move on the tap rather than when
// the page arrives (#384). The pill is UI state, not data, so this isn't an optimistic update.
// A layout effect, so the pill moves in the same frame as the tap's own commit.
function PendingReporter({ href, onPending }: { href: string; onPending: ReportPending }) {
  const { pending } = useLinkStatus()
  useLayoutEffect(() => {
    onPending(href, pending)
  }, [href, pending, onPending])
  return null
}

// Tapping your balance shows where your coins are. The chip keeps its 36px look inside a 44px link.
// The gold "4,886 DC" says what it is, so it has no coin icon (#385).
function BalanceChip({ balance, active, onPending }: { balance: number; active: boolean; onPending: ReportPending }) {
  return (
    <IntentLink
      prefetchOnTouch
      pendingMarker={false}
      href="/bets"
      transitionTypes={TAB_TRANSITION}
      aria-current={active ? 'page' : undefined}
      className="pressable inline-flex min-h-11 shrink-0 items-center rounded-full no-underline"
    >
      <PendingReporter href="/bets" onPending={onPending} />
      <span className={`inline-flex h-9 items-center whitespace-nowrap rounded-full bg-gold-soft px-3 ${uiTextClass} font-extrabold text-gold`}>
        <AnimatedText plainText={`Balance ${formatDcAmount(balance)}, view my bets`}>
          <BalanceNumber value={balance} />
        </AnimatedText>
      </span>
    </IntentLink>
  )
}

export type { NavMember }

// Below xl every label won't fit beside the wordmark, balance and avatar, so each link is a 44px
// icon until then, its label kept for assistive tech and as a hover tooltip. `active` is the page
// you're on; `shown` is where the pill sits, which moves to a tapped link before its page arrives.
function DesktopLink({
  href,
  label,
  active,
  shown,
  onPending,
  icon: Icon,
}: {
  href: string
  label: string
  active: boolean
  shown: boolean
  onPending: ReportPending
  icon: LucideIcon
}) {
  return (
    <IntentLink
      prefetchOnTouch
      pendingMarker={false}
      href={href}
      transitionTypes={TAB_TRANSITION}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={label}
      className={cn(
        `pressable pill-label relative isolate inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-full ${uiTextClass} font-bold no-underline xl:px-3.5`,
        shown ? 'text-on-nav-active' : 'text-ink2 hover:bg-sunk hover:text-ink',
      )}
    >
      <PendingReporter href={href} onPending={onPending} />
      {shown && (
        <m.span
          layoutId="nav-pill"
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full bg-nav-active"
          transition={PILL_TRANSITION}
        />
      )}
      <Icon aria-hidden="true" className="size-5 xl:hidden" />
      <span className="max-xl:sr-only">{label}</span>
      <NavPendingHint className="inset-x-3.5 bottom-1 h-0.5" />
    </IntentLink>
  )
}

// adminHref is null for members; for a reviewer or above it opens the section with work in it.
// adminAttention is what waits on the viewer there, shown on the avatar.
export function AppNav({
  balance,
  adminHref,
  adminAttention = 0,
  me,
}: {
  balance: number
  adminHref: string | null
  adminAttention?: number
  me: NavMember
}) {
  const pathname = usePathname()
  const motionReduced = useMotionSettingReduced()
  // Your own profile and Settings belong to the avatar, not the Leaderboard tab.
  const onMyProfile = pathname === `/members/${me.id}`
  const avatarActive = onMyProfile || pathname === '/settings'
  const active = onMyProfile ? null : activeNavId(pathname)
  // The link the member last tapped, while its page is on the way. Only the last tap's link is
  // pending, and it stops being pending as the new page commits.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const onPending = useCallback<ReportPending>(
    (href, pending) => setPendingHref((current) => (pending ? href : current === href ? null : current)),
    [],
  )
  const shown = pendingHref ? activeNavId(pendingHref) : active

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion={motionReduced ? 'always' : 'user'}>
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
          <Wordmark symbolBelowLg />
          <nav aria-label="Primary" className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => (
              <DesktopLink
                key={item.id}
                href={item.href}
                label={item.label}
                icon={ICONS[item.id]}
                active={active === item.id}
                shown={shown === item.id}
                onPending={onPending}
              />
            ))}
          </nav>
          <span className="grow" />
          <BalanceChip balance={balance} active={active === 'bets'} onPending={onPending} />
          <ProfileMenu me={me} active={avatarActive} adminHref={adminHref} attention={adminAttention} />
        </header>

        <header
          style={{ viewTransitionName: 'app-topbar' }}
          className="no-callout sticky top-(--safe-top) z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden"
        >
          <Wordmark size="sm" />
          <span className="grow" />
          <BalanceChip balance={balance} active={active === 'bets'} onPending={onPending} />
          <ProfileMenu me={me} active={avatarActive} adminHref={adminHref} attention={adminAttention} />
        </header>

        <nav
          aria-label="Primary"
          style={{ viewTransitionName: 'app-tabbar' }}
          className="no-callout fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-[calc(12px+var(--safe-bottom))] md:hidden"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.id]
            const isActive = active === item.id
            const isShown = shown === item.id
            return (
              <IntentLink
                prefetchOnTouch
                pendingMarker={false}
                key={item.id}
                href={item.href}
                transitionTypes={TAB_TRANSITION}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tabAriaLabel(item)}
                onClick={haptics.tap}
                className={cn(
                  'pressable pill-label relative flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-tile text-xs leading-[1.1] no-underline',
                  isShown ? 'text-ink' : 'text-ink2',
                )}
              >
                <PendingReporter href={item.href} onPending={onPending} />
                <span
                  className={cn(
                    'relative isolate flex h-[30px] w-[52px] items-center justify-center rounded-full transition-colors duration-(--duration-slide) ease-ios motion-reduce:transition-none',
                    isShown && 'text-on-tab-active',
                  )}
                >
                  {/* One pill that slides between tabs, like the desktop nav's. The tab bar stays
                      pinned through page transitions, and its new snapshot is live, so the slide
                      shows while the page moves under it. */}
                  {isShown && (
                    <m.span
                      layoutId="tabbar-pill"
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-full border-[1.5px] border-tab-active-ring bg-tab-active"
                      transition={PILL_TRANSITION}
                    />
                  )}
                  <Icon aria-hidden="true" className="size-[22px]" />
                </span>
                {/* Manrope is variable, so the weight eases between bold and extrabold; the label
                    is centred in a fixed-width column, so nothing beside it moves. */}
                <span
                  className={cn(
                    'transition-[font-weight] duration-(--duration-slide) ease-ios motion-reduce:transition-none',
                    isShown ? 'font-extrabold' : 'font-bold',
                  )}
                >
                  {item.shortLabel}
                </span>
                <NavPendingHint className="bottom-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2" />
              </IntentLink>
            )
          })}
        </nav>
      </MotionConfig>
    </LazyMotion>
  )
}
