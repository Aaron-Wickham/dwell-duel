// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }) }))

import { SegmentedControl, segmentClass, segmentMarker } from '@/components/ui/segmented-control'
import { SubNav } from '@/components/ui/sub-nav'
import { StatusChip } from '@/components/ui/status-chip'

function Control({ active }: { active: 'a' | 'b' }) {
  return (
    <SegmentedControl role="group" aria-label="Pick one" activeKey={active}>
      {(['a', 'b'] as const).map((key) => (
        <button key={key} type="button" aria-pressed={active === key} {...segmentMarker(active === key)} className={segmentClass(active === key)}>
          {key.toUpperCase()}
        </button>
      ))}
    </SegmentedControl>
  )
}

describe('SegmentedControl', () => {
  it('draws one track with one radius pair and a pill on the chosen segment', () => {
    render(<Control active="b" />)
    const track = screen.getByRole('group', { name: 'Pick one' })
    expect(track).toHaveClass('rounded-tile', 'bg-sunk', 'p-1')
    expect(track).toHaveAttribute('data-ready')
    const pill = track.querySelector('[aria-hidden="true"]')
    expect(pill).toHaveClass('rounded-segment', 'bg-segment-active', 'shadow-tab')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('data-segment-active')
    expect(screen.getByRole('button', { name: 'A' })).not.toHaveAttribute('data-segment-active')
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('rounded-segment', 'min-h-11', 'pressable')
  })

  it('moves the marker when the choice changes', () => {
    const { rerender } = render(<Control active="a" />)
    rerender(<Control active="b" />)
    expect(screen.getByRole('button', { name: 'B', pressed: true })).toHaveAttribute('data-segment-active')
    expect(screen.getByRole('button', { name: 'A', pressed: false })).not.toHaveAttribute('data-segment-active')
  })

  it('builds SubNav, which keeps its links and aria-current', () => {
    render(
      <SubNav
        label="My bets"
        items={[
          { href: '/bets?tab=open', label: 'Open', current: true },
          { href: '/bets?tab=settled', label: 'Settled', current: false },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'My bets' })
    expect(nav).toHaveClass('rounded-tile', 'bg-sunk')
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('data-segment-active')
    expect(screen.getByRole('link', { name: 'Settled' })).not.toHaveAttribute('aria-current')
  })
})

describe('StatusChip', () => {
  it('has a won tone from the win tokens, and a neutral done', () => {
    render(
      <>
        <StatusChip tone="won">Won 5 DC</StatusChip>
        <StatusChip tone="done">Resolved</StatusChip>
      </>,
    )
    expect(screen.getByText('Won 5 DC')).toHaveClass('bg-win-soft', 'text-win', 'h-7')
    expect(screen.getByText('Resolved')).toHaveClass('bg-sunk', 'text-ink')
    expect(screen.getByText('Resolved').className).not.toMatch(/primary|lime/)
  })

  it('comes in a small size', () => {
    render(
      <StatusChip tone="void" size="sm">
        Weekly
      </StatusChip>,
    )
    expect(screen.getByText('Weekly')).toHaveClass('h-6', 'px-[9px]', 'text-xs')
  })
})
