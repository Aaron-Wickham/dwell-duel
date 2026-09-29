// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { ChartColumn } from 'lucide-react'

vi.mock('@/lib/markets/cancel-bet', () => ({ cancelBetAction: vi.fn() }))
vi.mock('@/lib/markets/create-market', () => ({ createMarketAction: vi.fn() }))
vi.mock('@/lib/theme/set-theme', () => ({ setThemeAction: vi.fn() }))
vi.mock('@/lib/preferences/set-preference', () => ({ setHapticsAction: vi.fn(), setReduceMotionAction: vi.fn() }))

import { BackLink } from '@/components/ui/back-link'
import { Wordmark } from '@/components/brand/wordmark'
import { MarketCard } from '@/components/markets/market-card'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import { HomeTiles } from '@/components/home/home-tiles'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'
import { Podium } from '@/components/leaderboard/podium'
import { Awards } from '@/components/leaderboard/awards'
import { PastChampions } from '@/components/leaderboard/past-champions'
import { CancelledBetRows, WagerRows } from '@/app/(app)/bets/bet-rows'
import { MemberIdentity } from '@/app/(app)/admin/members/member-identity'
import { MotionSettings } from '@/app/(app)/settings/settings-controls'
import { CreateMarketForm } from '@/app/(app)/markets/new/create-market-form'

const MEMBER = { id: 'm1', name: 'Grace', avatarSrc: null }

// Every tap target in these gives under the finger (#156): it carries `pressable` itself, or it
// is the stretched link of a card that does. A new link or button in one of them that forgets
// fails here.
const CASES: [string, () => ReactElement][] = [
  ['BackLink', () => <BackLink href="/markets">Markets</BackLink>],
  ['Wordmark', () => <Wordmark />],
  [
    'MarketCard',
    () => (
      <MarketCard
        id="k1"
        title="Will it rain?"
        status="open"
        kind="binary"
        closeAt="2026-10-01T12:00:00Z"
        resolvedAt={null}
        outcomes={[{ id: 'o1', label: 'Yes', pct: 60 }, { id: 'o2', label: 'No', pct: 40 }]}
        resolvedOutcomeLabel={null}
      />
    ),
  ],
  [
    'PlacedParlay',
    () => (
      <ul>
        <PlacedParlay
          parlay={{
            id: 'p1',
            stake: 5,
            status: 'pending',
            credited: 0,
            multiplierBp: 40_000,
            capped: false,
            potentialPayout: 20,
            createdAt: '2026-09-25T12:00:00Z',
            legs: [{ marketId: 'k1', marketTitle: 'Will it rain?', outcomeLabel: 'Yes', lockedOddsBp: 20_000, status: 'pending' }],
          }}
        />
      </ul>
    ),
  ],
  [
    'HomeTiles',
    () => <HomeTiles tiles={[{ id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: 'Bet on it' }]} />,
  ],
  [
    'LeaderboardRow',
    () => (
      <ol>
        <LeaderboardRow rank={1} name="Grace" score={120} isMe={false} href="/members/m1" />
      </ol>
    ),
  ],
  [
    'Podium',
    () => (
      <Podium
        signed={false}
        meId="m9"
        members={[1, 2, 3].map((rank) => ({ ...MEMBER, id: `m${rank}`, name: `Member ${rank}`, score: 100 - rank, rank }))}
      />
    ),
  ],
  [
    'Awards',
    () => <Awards awards={[{ kind: 'most_active', memberId: 'm1', name: 'Grace', avatarSrc: null, value: 4, detail: null }]} />,
  ],
  ['PastChampions', () => <PastChampions champions={[{ season: '2026-08', memberId: 'm1', name: 'Grace', profit: 40 }]} />],
  [
    'WagerRows',
    () => (
      <WagerRows
        rowIdPrefix="bet"
        wagers={[
          {
            kind: 'bet',
            key: 'bet:1',
            bet: {
              id: 1,
              marketId: 'k1',
              marketTitle: 'Will it rain?',
              outcomeLabel: 'Yes',
              amount: 5,
              placedAt: '2026-09-25T12:00:00Z',
              closeAt: '2026-10-01T12:00:00Z',
              result: { kind: 'open' },
            },
          },
        ]}
      />
    ),
  ],
  [
    'CancelledBetRows',
    () => (
      <CancelledBetRows
        rowIdPrefix="cancelled"
        bets={[{ id: 2, marketId: 'k1', marketTitle: 'Will it rain?', outcomeLabel: 'No', amount: 5, cancelledAt: '2026-09-25T12:00:00Z' }]}
      />
    ),
  ],
  [
    'MemberIdentity',
    () => (
      <MemberIdentity
        now={Date.parse('2026-09-28T12:00:00Z')}
        member={{ id: 'm1', displayName: 'Grace', avatarSrc: null, email: 'g@example.com', balance: 90, role: 'member', joinedAt: null, lastSignInAt: null }}
      />
    ),
  ],
  ['MotionSettings', () => <MotionSettings haptics reduceMotion={false} />],
  ['CreateMarketForm', () => <CreateMarketForm />],
]

function tapTargets(container: HTMLElement): HTMLElement[] {
  // A label is a tap target when it wraps a switch-like checkbox; a text field's label isn't.
  return [...container.querySelectorAll<HTMLElement>('a, button, summary, label:has(input[type="checkbox"])')]
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

describe('press feedback', () => {
  it.each(CASES)('%s: every tap target presses', (_name, ui) => {
    const { container } = render(ui())
    const targets = tapTargets(container)
    expect(targets.length).toBeGreaterThan(0)
    for (const el of targets) {
      if (el.classList.contains('stretched-link')) {
        // The cover is the link's ::after, positioned against the card that presses.
        expect(el.parentElement!.closest('.pressable'), el.outerHTML).toHaveClass('relative')
      } else {
        expect(el, el.outerHTML).toHaveClass('pressable')
      }
    }
  })

  it('presses the market page’s edit history disclosure', () => {
    const page = readFileSync(path.resolve(import.meta.dirname, '../../app/(app)/markets/[id]/page.tsx'), 'utf8')
    expect(page).toMatch(/<summary className="[^"]*\bpressable\b/)
  })
})
