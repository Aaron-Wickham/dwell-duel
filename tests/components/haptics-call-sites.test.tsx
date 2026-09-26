// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { haptics } = vi.hoisted(() => ({ haptics: { tap: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/haptics', () => ({ haptics }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { ToastActionForm } from '@/components/ui/toast-action-form'
import { Message } from '@/components/ui/message'

type State = { formError?: string } | undefined
const hasError = (state: State) => Boolean(state?.formError)

beforeEach(() => {
  haptics.tap.mockReset()
  haptics.success.mockReset()
  haptics.error.mockReset()
})

describe('success haptic', () => {
  it('buzzes with every success toast from withSuccessToast', async () => {
    await withSuccessToast(async (): Promise<State> => undefined, hasError, 'Bet placed.')(undefined, new FormData())
    expect(haptics.success).toHaveBeenCalledOnce()
  })

  it('stays still when the action fails', async () => {
    await withSuccessToast(async (): Promise<State> => ({ formError: 'Nope.' }), hasError, 'Bet placed.')(
      undefined,
      new FormData(),
    )
    expect(haptics.success).not.toHaveBeenCalled()
  })
})

describe('tap haptic', () => {
  it('taps as soon as a slip form is submitted, before the action resolves', async () => {
    let resolve: () => void = () => {}
    const action = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    render(
      <ToastActionForm action={action} successMessage="Added to your slip.">
        <button type="submit">Add to parlay</button>
      </ToastActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay' }))
    await waitFor(() => expect(action).toHaveBeenCalledOnce())
    expect(haptics.tap).toHaveBeenCalledOnce()
    resolve()
  })
})

describe('error haptic', () => {
  it('buzzes once when an inline error appears, not on re-renders', () => {
    const { rerender } = render(<Message tone="error">Insufficient balance.</Message>)
    expect(haptics.error).toHaveBeenCalledOnce()
    rerender(<Message tone="error">Insufficient balance.</Message>)
    expect(haptics.error).toHaveBeenCalledOnce()
  })

  it('buzzes again when the error comes back after clearing', () => {
    function Form({ error }: { error?: string }) {
      return <form>{error && <Message tone="error">{error}</Message>}</form>
    }
    const { rerender } = render(<Form error="Nope." />)
    rerender(<Form />)
    rerender(<Form error="Nope." />)
    expect(haptics.error).toHaveBeenCalledTimes(2)
  })

  it.each(['ok', 'gold'] as const)('stays still for a %s message', (tone) => {
    render(<Message tone={tone}>Parlay placed.</Message>)
    expect(haptics.error).not.toHaveBeenCalled()
  })
})
