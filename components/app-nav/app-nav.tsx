'use client'

import { IntentLink } from '@/components/ui/intent-link'
import { usePathname } from 'next/navigation'
import { LazyMotion, MotionConfig } from 'motion/react'
import * as m from 'motion/react-m'
import { BookOpen, ChartColumn, CircleDot, MessageSquareText, ShieldCheck, Ticket, Trophy, type LucideIcon } from 'lucide-react'
import { BetaBadge } from '@/components/brand/beta-badge'
import { Wordmark } from '@/components/brand/wordmark'
import { AnimatedText } from '@/components/ui/animated-text'
import { AttentionBadge, AttentionNote } from '@/components/ui/attention-badge'
import { Avatar } from '@/components/ui/avatar'
import { NavPendingHint } from '@/components/nav/nav-pending-hint'
import { haptics } from '@/lib/haptics'
import { ICON_POP, PILL_TRANSITION } from '@/lib/ui/motion'
import { useMotionSettingReduced } from '@/lib/ui/reduced-motion'
import { cn } from '@/lib/utils'
import { BalanceNumber } from './balance-number'
import { NAV_ITEMS, activeNavId, tabAriaLabel, type NavId } from './nav-items'
import { uiTextClass } from '@/components/ui/page'

const loadMotionFeatures = () => import('@/lib/ui/motion-features').then((mod) => mod.default)

const ICONS: Record<NavId, LucideIcon> = {
  markets: ChartColumn,
  bets: Ticket,
  tasks: BookOpen,
  feed: MessageSquareText,
  leaderboard: Trophy,
  admin: ShieldCheck,
}

// Tapping your balance shows where your coins are. The chip keeps its 36px look inside a 44px link.
function BalanceChip({ balance, active }: { balance: number; active: boolean }) {
  return (
    <IntentLink
      prefetchOnTouch
      href="/bets"
      aria-current={active ? 'page' : undefined}
      className="pressable inline-flex min-h-11 shrink-0 items-center rounded-full no-underline"
    >
      <span className={`inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-full bg-gold-soft pr-2.5 pl-1.5 ${uiTextClass} font-extrabold tabular-nums text-gold md:gap-1.5 md:pr-3 md:pl-2`}>
        <CircleDot aria-hidden="true" className="size-4 md:size-[18px]" />
        <AnimatedText plainText={`Balance ${balance} DC, view my bets`}>
          <BalanceNumber value={balance} />
        </AnimatedText>
      </span>
    </IntentLink>
  )
}

export type NavMember = { id: string; name: string; avatarSrc: string | null }

function ProfileLink({ me, active }: { me: NavMember; active: boolean }) {
  return (
    <IntentLink
      prefetchOnTouch
      href={`/members/${me.id}`}
      aria-label="Your profile"
      aria-current={active ? 'page' : undefined}
      className="pressable relative inline-flex size-11 shrink-0 items-center justify-center rounded-full no-underline"
    >
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-full',
          active && 'ring-2 ring-nav-active ring-offset-2 ring-offset-surface',
        )}
      >
        <Avatar name={me.name} src={me.avatarSrc} size="nav" />
      </span>
      <NavPendingHint className="inset-x-3 bottom-0 h-0.5" />
    </IntentLink>
  )
}

// Below xl every label won't fit beside the wordmark, balance and avatar (an admin's row needs
// ~1180px), so each link is a 44px icon until then, its label kept for assistive tech and as a
// hover tooltip. `iconWithLabel` keeps the icon beside the label from xl too, as Admin's does.
function DesktopLink({
  href,
  label,
  active,
  icon: Icon,
  iconWithLabel = false,
  transitionTypes,
  attention = 0,
}: {
  href: string
  label: string
  active: boolean
  icon: LucideIcon
  iconWithLabel?: boolean
  transitionTypes?: string[]
  attention?: number
}) {
  return (
    <IntentLink
      prefetchOnTouch
      href={href}
      transitionTypes={transitionTypes}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      aria-describedby={attention > 0 ? 'admin-attention-desktop' : undefined}
      title={label}
      className={cn(
        `pressable relative isolate inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-full ${uiTextClass} font-bold no-underline xl:px-3.5`,
        active ? 'text-on-nav-active' : 'text-ink2 hover:bg-sunk hover:text-ink',
      )}
    >
      {active && (
        <m.span
          layoutId="nav-pill"
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full bg-nav-active"
          transition={PILL_TRANSITION}
        />
      )}
      <Icon aria-hidden="true" className={cn('size-5 xl:size-[18px]', !iconWithLabel && 'xl:hidden')} />
      <span className="max-xl:sr-only">{label}</span>
      <AttentionNote id="admin-attention-desktop" count={attention} />
      <AttentionBadge count={attention} className="-top-1 -right-1" />
      <NavPendingHint className="inset-x-3.5 bottom-1 h-0.5" />
    </IntentLink>
  )
}

// adminHref is null for members; reviewers land on the approval queue, admins on invites.
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
  // Your own profile belongs to the avatar, not the Leaderboard tab.
  const onMyProfile = pathname === `/members/${me.id}`
  const active = onMyProfile ? null : activeNavId(pathname)

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
          <div className="flex shrink-0 items-center gap-2">
            <Wordmark symbolBelowLg current={pathname === '/'} />
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
              />
            ))}
            {adminHref && (
              <>
                <span aria-hidden="true" className="mx-1.5 h-6 w-px bg-line" />
                <DesktopLink
                  href={adminHref}
                  label="Admin"
                  active={active === 'admin'}
                  icon={ShieldCheck}
                  iconWithLabel
                  transitionTypes={['nav-forward']}
                  attention={adminAttention}
                />
              </>
            )}
          </nav>
          <span className="grow" />
          <BalanceChip balance={balance} active={active === 'bets'} />
          <ProfileLink me={me} active={onMyProfile} />
        </header>

        <header
          style={{ viewTransitionName: 'app-topbar' }}
          className="no-callout sticky top-(--safe-top) z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden"
        >
          {/* At 375px with a five-digit balance there's no width to spare beside the wordmark, so the
              badge tucks under its right end instead. It's decorative, so taps pass through to the link.
              Below 360px an admin's extra button leaves room only for the symbol, and the badge goes too. */}
          <div className="relative shrink-0">
            <Wordmark size="sm" current={pathname === '/'} symbolOnNarrow={Boolean(adminHref)} />
            <BetaBadge
              className={cn(
                'pointer-events-none absolute right-1 -bottom-1.5 h-3.5 px-1.5 text-[9px]',
                adminHref && 'max-[359px]:hidden',
              )}
            />
          </div>
          <span className="grow" />
          <BalanceChip balance={balance} active={active === 'bets'} />
          {adminHref && (
            <IntentLink
              prefetchOnTouch
              href={adminHref}
              transitionTypes={['nav-forward']}
              aria-label="Admin"
              aria-describedby={adminAttention > 0 ? 'admin-attention-mobile' : undefined}
              aria-current={active === 'admin' ? 'page' : undefined}
              className={cn(
                'pressable relative inline-flex size-11 shrink-0 items-center justify-center rounded-control no-underline',
                active === 'admin' ? 'border-[1.5px] border-tab-active-ring bg-tab-active text-on-tab-active' : 'text-ink hover:bg-sunk',
              )}
            >
              <ShieldCheck aria-hidden="true" className="size-[22px]" />
              <AttentionNote id="admin-attention-mobile" count={adminAttention} />
              <AttentionBadge count={adminAttention} className="top-1 right-1" />
              <NavPendingHint className="inset-x-3 bottom-1 h-0.5" />
            </IntentLink>
          )}
          <ProfileLink me={me} active={onMyProfile} />
        </header>

        <nav
          aria-label="Primary"
          style={{ viewTransitionName: 'app-tabbar' }}
          className="no-callout fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-[calc(12px+var(--safe-bottom))] md:hidden"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.id]
            const isActive = active === item.id
            return (
              <IntentLink
                prefetchOnTouch
                key={item.id}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tabAriaLabel(item)}
                onClick={haptics.tap}
                className={cn(
                  'pressable relative flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-tile text-xs leading-[1.1] no-underline',
                  isActive ? 'text-ink' : 'text-ink2',
                )}
              >
                <span
                  className={cn(
                    'relative isolate flex h-[30px] w-[52px] items-center justify-center rounded-full',
                    isActive && 'text-on-tab-active',
                  )}
                >
                  {/* One pill that slides between tabs, like the desktop nav's. The tab bar stays
                      pinned through page transitions, and its new snapshot is live, so the slide
                      shows while the page moves under it. */}
                  {isActive && (
                    <m.span
                      layoutId="tabbar-pill"
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-full border-[1.5px] border-tab-active-ring bg-tab-active"
                      transition={PILL_TRANSITION}
                    />
                  )}
                  {/* The newly active icon pops as the pill arrives; initial={false} keeps a cold
                      launch still, and MotionConfig drops it under reduced motion. */}
                  <m.span
                    className="flex"
                    initial={false}
                    animate={{ scale: isActive ? [1, 1.18, 1] : 1 }}
                    transition={ICON_POP}
                  >
                    <Icon aria-hidden="true" className="size-[22px]" />
                  </m.span>
                </span>
                {/* Manrope is variable, so the weight eases between bold and extrabold; the label
                    is centred in a fixed-width column, so nothing beside it moves. */}
                <span
                  className={cn(
                    'transition-[font-weight] duration-(--duration-slide) ease-ios motion-reduce:transition-none',
                    isActive ? 'font-extrabold' : 'font-bold',
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
