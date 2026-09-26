// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomeHero } from '@/components/home/home-hero'

type NumberFlowProps = { value: number; suffix?: string; locales?: unknown; format?: { useGrouping?: boolean } }
const { numberFlowCalls } = vi.hoisted(() => ({ numberFlowCalls: [] as NumberFlowProps[] }))
vi.mock('@number-flow/react', () => ({
  default: (props: NumberFlowProps) => {
    numberFlowCalls.push(props)
    return `${props.value}${props.suffix ?? ''}`
  },
}))

beforeEach(() => {
  numberFlowCalls.length = 0
})

describe('HomeHero', () => {
  it('shows exactly one "Balance: n DC" element, plus the rank and pending caption', () => {
    render(<HomeHero balance={120} rank={3} memberCount={8} pendingCount={1} pendingDc={25} />)
    // The number is its own <span>, so the sentence is only the <p>'s combined text (Testing Library's
    // string/regex matchers read an element's own text nodes only; Playwright reads descendants too).
    expect(
      screen.getAllByText((_, element) => element?.tagName === 'P' && /Balance: \d+ DC/.test(element.textContent ?? '')),
    ).toHaveLength(1)
    expect(screen.getByText('Rank 3 of 8 · 25 DC pending in 1 task review')).toBeInTheDocument()
  })

  it('drops the pending clause when nothing is pending', () => {
    render(<HomeHero balance={50} rank={1} memberCount={1} pendingCount={0} pendingDc={0} />)
    expect(screen.getByText('Rank 1 of 1')).toBeInTheDocument()
  })

  it('formats the balance as plain digits, in en-US regardless of the browser locale', () => {
    render(<HomeHero balance={1250} rank={3} memberCount={8} pendingCount={1} pendingDc={25} />)
    expect(numberFlowCalls).toHaveLength(1)
    expect(numberFlowCalls[0].locales).toBe('en-US')
    expect(numberFlowCalls[0].format?.useGrouping).toBe(false)
  })
})
