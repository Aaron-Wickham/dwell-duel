// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipPick } from '@/components/parlays/slip-pick'
import type { SlipPick as SlipPickView } from '@/lib/parlays/get-slip'

type NumberFlowProps = { value: number; suffix?: string; locales?: unknown; format?: { useGrouping?: boolean } }
const { numberFlowCalls } = vi.hoisted(() => ({ numberFlowCalls: [] as NumberFlowProps[] }))
vi.mock('@number-flow/react', () => ({
  default: (props: NumberFlowProps) => {
    numberFlowCalls.push(props)
    return `${props.value}${props.suffix ?? ''}`
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const live: SlipPickView = {
  outcomeId: 'o1',
  outcomeLabel: 'No',
  marketId: 'm1',
  marketTitle: 'Will it rain on the church picnic?',
  oddsBp: 40_000,
  available: true,
}

describe('SlipPick', () => {
  it('shows a live pick with its market link, outcome and odds', () => {
    render(<SlipPick pick={live} removeAction={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Will it rain on the church picnic?' })).toHaveAttribute('href', '/markets/m1')
    expect(screen.getByText('No')).toBeInTheDocument()
    expect(screen.getByText('4.00×', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.queryByText('No longer available')).toBeNull()
  })

  it('gives the market title link a 44px tap target', () => {
    render(<SlipPick pick={live} removeAction={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Will it rain on the church picnic?' })).toHaveClass('min-h-11')
  })

  it('formats the odds as plain digits, in en-US regardless of the browser locale', () => {
    numberFlowCalls.length = 0
    render(<SlipPick pick={live} removeAction={vi.fn()} />)
    expect(numberFlowCalls).toHaveLength(1)
    expect(numberFlowCalls[0].locales).toBe('en-US')
    expect(numberFlowCalls[0].format?.useGrouping).toBe(false)
  })

  it('marks a pick that is no longer available instead of showing odds', () => {
    render(<SlipPick pick={{ ...live, available: false, oddsBp: null }} removeAction={vi.fn()} />)
    expect(screen.getByText('No longer available')).toHaveClass('bg-loss-soft', 'text-loss')
    expect(screen.queryByText(/×/)).toBeNull()
  })

  it('names the Remove button after the pick and submits the remove action', async () => {
    const removeAction = vi.fn()
    render(<SlipPick pick={live} removeAction={removeAction} />)
    const button = screen.getByRole('button', { name: 'Remove No, Will it rain on the church picnic?' })
    expect(button).toHaveClass('min-h-11')
    await userEvent.click(button)
    await waitFor(() => expect(removeAction).toHaveBeenCalledTimes(1))
  })

  it('runs the optimistic removal as the Remove button is pressed', async () => {
    const optimisticRemove = vi.fn()
    render(<SlipPick pick={live} removeAction={vi.fn()} optimisticRemove={optimisticRemove} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove No, Will it rain on the church picnic?' }))
    expect(optimisticRemove).toHaveBeenCalledTimes(1)
  })
})
