// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

type NumberFlowProps = { value: number; animated?: boolean }
const { calls } = vi.hoisted(() => ({ calls: [] as NumberFlowProps[] }))
vi.mock('@number-flow/react', () => ({
  default: (props: NumberFlowProps) => {
    calls.push(props)
    return String(props.value)
  },
}))

import { AnimatedNumber } from '@/components/ui/animated-number'

beforeEach(() => {
  calls.length = 0
  delete document.documentElement.dataset.motion
})

// #383: counting is for a number that changes because of you or a live update, not a page load.
describe('AnimatedNumber', () => {
  it('shows the final figure at once on first render', () => {
    render(<AnimatedNumber value={120} />)
    expect(calls.at(-1)).toMatchObject({ value: 120, animated: false })
  })

  it('counts once the value changes after mount, and keeps counting', () => {
    const { rerender } = render(<AnimatedNumber value={120} />)
    rerender(<AnimatedNumber value={110} />)
    expect(calls.at(-1)).toMatchObject({ value: 110, animated: true })
    rerender(<AnimatedNumber value={120} />)
    expect(calls.at(-1)).toMatchObject({ value: 120, animated: true })
  })

  it('stays still under Settings’ Reduce animations, and when asked not to animate', () => {
    document.documentElement.dataset.motion = 'reduce'
    const { rerender } = render(<AnimatedNumber value={120} />)
    rerender(<AnimatedNumber value={110} />)
    expect(calls.at(-1)).toMatchObject({ value: 110, animated: false })

    delete document.documentElement.dataset.motion
    rerender(<AnimatedNumber value={100} animated={false} />)
    expect(calls.at(-1)).toMatchObject({ value: 100, animated: false })
  })
})
