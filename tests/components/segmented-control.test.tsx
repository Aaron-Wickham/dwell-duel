// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    const pill = track.querySelector('[aria-hidden="true"]')!
    const fills = [...pill.children].filter((piece) => piece.classList.contains('bg-segment-active'))
    expect(fills).toHaveLength(3)
    for (const fill of fills) expect(fill).toHaveClass('border-ink2')
    // Each cap is a whole rounded box, clipped to its outer half.
    for (const cap of [fills[1], fills[2]]) expect(cap).toHaveClass('rounded-segment', 'border')
    expect(pill.querySelector('[data-pill-shadow]')).toHaveClass('rounded-segment', 'shadow-tab')
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

  describe('sliding', () => {
    // jsdom has no layout or WAAPI: give each segment a box from its data attributes, and record
    // every animation the pill starts.
    const animate = vi.fn()
    const boxDescriptors = {
      offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft')!,
      offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!,
    }
    beforeEach(() => {
      animate.mockClear()
      vi.stubGlobal('matchMedia', () => ({ matches: false }))
      Element.prototype.animate = function (this: Element, keyframes: Keyframe[]) {
        animate(this, keyframes)
        return {} as Animation
      } as Element['animate']
      for (const [prop, attr] of [
        ['offsetLeft', 'data-x'],
        ['offsetWidth', 'data-w'],
      ] as const) {
        Object.defineProperty(HTMLElement.prototype, prop, {
          configurable: true,
          get(this: HTMLElement) {
            if (this.hasAttribute('data-pill-end')) return 20
            return Number(this.getAttribute(attr) ?? 0)
          },
        })
      }
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      Reflect.deleteProperty(Element.prototype, 'animate')
      for (const [prop, descriptor] of Object.entries(boxDescriptors)) Object.defineProperty(HTMLElement.prototype, prop, descriptor)
    })

    function Boxes({ active }: { active: 'a' | 'b' }) {
      const boxes = { a: { x: 4, w: 60 }, b: { x: 68, w: 120 } }
      return (
        <SegmentedControl role="group" aria-label="Pick one" activeKey={active}>
          {(['a', 'b'] as const).map((key) => (
            <button key={key} type="button" data-x={boxes[key].x} data-w={boxes[key].w} {...segmentMarker(active === key)} className={segmentClass(active === key)}>
              {key.toUpperCase()}
            </button>
          ))}
        </SegmentedControl>
      )
    }

    // ST-8: left and width ran layout every frame.
    it('slides between unequal segments on transforms alone', () => {
      const { rerender } = render(<Boxes active="a" />)
      expect(animate).not.toHaveBeenCalled()
      rerender(<Boxes active="b" />)

      const pill = screen.getByRole('group', { name: 'Pick one' }).querySelector<HTMLElement>('[aria-hidden="true"]')!
      expect(pill.style.left).toBe('68px')
      expect(pill.style.width).toBe('120px')
      const properties = animate.mock.calls.flatMap(([, keyframes]) => (keyframes as Keyframe[]).flatMap((k) => Object.keys(k)))
      expect(new Set(properties)).toEqual(new Set(['transform']))

      const from = (el: Element) => animate.mock.calls.filter(([target]) => target === el).map(([, k]) => (k as Keyframe[])[0].transform)
      expect(from(pill)).toEqual(['translateX(-64px)'])
      expect(from(pill.querySelector('[data-pill-end]')!)).toEqual(['translateX(-60px)'])
      // The middle spans the pill less a 10px radius each side, plus a pixel under each cap.
      expect(from(pill.querySelector('[data-pill-middle]')!)).toEqual([`scaleX(${42 / 102})`])
      expect(from(pill.querySelector('[data-pill-shadow]')!)).toEqual([`scaleX(${60 / 120})`])
      expect(animate).toHaveBeenCalledTimes(4)
      for (const [, keyframes] of animate.mock.calls) expect((keyframes as Keyframe[])[1].transform).toMatch(/^(translateX\(0\)|scaleX\(1\))$/)
    })

    it('moves without sliding under reduced motion', () => {
      document.documentElement.dataset.motion = 'reduce'
      try {
        const { rerender } = render(<Boxes active="a" />)
        rerender(<Boxes active="b" />)
        expect(animate).not.toHaveBeenCalled()
        expect(screen.getByRole('group', { name: 'Pick one' }).querySelector<HTMLElement>('[aria-hidden="true"]')!.style.left).toBe('68px')
      } finally {
        delete document.documentElement.dataset.motion
      }
    })
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
