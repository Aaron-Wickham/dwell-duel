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

const BASE = { balance: 120, rank: 3, memberCount: 8, atStakeDc: 85, atStakeWagers: 4, pendingCount: 1, pendingDc: 25 }

beforeEach(() => {
  numberFlowCalls.length = 0
})

describe('HomeHero', () => {
  it('shows the balance without a "Balance:" label, with the rank as a chip beside it', () => {
    render(<HomeHero {...BASE} />)
    const hero = screen.getByRole('region', { name: 'Your balance' })
    expect(hero).toHaveTextContent('Dwell Coin')
    expect(screen.getByText('120 DC', { selector: '.sr-only' })).toBeInTheDocument()
    expect(hero).not.toHaveTextContent(/Balance:/)
    expect(screen.getByText('Rank 3 of 8')).toHaveClass('rounded-full')
  })

  it('links what is at stake to My bets and what is pending to Tasks', () => {
    render(<HomeHero {...BASE} />)
    expect(screen.getByRole('link', { name: 'At stake: 85 DC on 4 bets' })).toHaveAttribute('href', '/bets')
    expect(screen.getByRole('link', { name: 'Pending: 25 DC in 1 review' })).toHaveAttribute('href', '/tasks')
  })

  it('hides Pending when nothing is waiting, and says when nothing is riding', () => {
    render(<HomeHero {...BASE} atStakeDc={0} atStakeWagers={0} pendingCount={0} pendingDc={0} />)
    expect(screen.getByRole('link', { name: 'At stake: 0 DC Nothing riding' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Pending/ })).toBeNull()
  })

  it('leaves out the rank chip when there is no standing yet', () => {
    render(<HomeHero {...BASE} rank={0} memberCount={0} />)
    expect(screen.queryByText(/^Rank/)).toBeNull()
  })

  it('formats every number as plain digits, in en-US regardless of the browser locale', () => {
    render(<HomeHero {...BASE} balance={1250} />)
    expect(numberFlowCalls).toHaveLength(3)
    for (const call of numberFlowCalls) {
      expect(call.locales).toBe('en-US')
      expect(call.format?.useGrouping).toBe(false)
    }
  })

  it('keeps each stat a 44px tap target with a press state', () => {
    render(<HomeHero {...BASE} />)
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('min-h-11', 'pressable', 'no-underline')
  })

  it('points a member at exactly 0 DC to Tasks, with what tasks pay (#260)', () => {
    render(<HomeHero {...BASE} balance={0} taskRewards={{ min: 5, max: 25 }} />)
    const hero = screen.getByRole('region', { name: 'Your balance' })
    expect(hero).toHaveTextContent('You’re out of Dwell Coin. Earn more with Tasks: they pay 5–25 DC.')
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks')
  })

  it('still points to Tasks when there are none to quote', () => {
    render(<HomeHero {...BASE} balance={0} />)
    expect(screen.getByRole('region', { name: 'Your balance' })).toHaveTextContent('You’re out of Dwell Coin. Earn more with Tasks.')
  })

  it('says nothing about earning while there is any DC left', () => {
    render(<HomeHero {...BASE} balance={1} taskRewards={{ min: 5, max: 25 }} />)
    expect(screen.queryByText(/out of Dwell Coin/)).toBeNull()
  })
})
