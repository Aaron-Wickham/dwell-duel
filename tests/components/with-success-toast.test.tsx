// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useActionState, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

type State = { formError?: string } | undefined

const hasError = (state: State) => Boolean(state?.formError)

beforeEach(() => {
  success.mockReset()
})

describe('withSuccessToast', () => {
  it('passes the state and payload through and returns the action’s result', async () => {
    const action = vi.fn(async (_state: State, _formData: FormData): Promise<State> => ({ formError: 'Nope.' }))
    const formData = new FormData()

    await expect(withSuccessToast(action, hasError, 'Done.')(undefined, formData)).resolves.toEqual({ formError: 'Nope.' })
    expect(action).toHaveBeenCalledWith(undefined, formData)
  })

  it('toasts once when the action resolves without an error', async () => {
    await withSuccessToast(async (): Promise<State> => undefined, hasError, 'Done.')(undefined, new FormData())
    expect(success).toHaveBeenCalledTimes(1)
    expect(success).toHaveBeenCalledWith('Done.')
  })

  it('does not toast when the action returns an error', async () => {
    await withSuccessToast(async (): Promise<State> => ({ formError: 'Nope.' }), hasError, 'Done.')(undefined, new FormData())
    expect(success).not.toHaveBeenCalled()
  })

  it('still toasts when succeeding unmounts the form that submitted it', async () => {
    function Form({ onSuccess }: { onSuccess: () => void }) {
      const [, formAction] = useActionState<State, FormData>(
        withSuccessToast(
          async (): Promise<State> => {
            onSuccess()
            return undefined
          },
          hasError,
          'Done.',
        ),
        undefined,
      )
      return (
        <form action={formAction}>
          <button type="submit">Go</button>
        </form>
      )
    }
    function Page() {
      const [done, setDone] = useState(false)
      return done ? <p>Gone</p> : <Form onSuccess={() => setDone(true)} />
    }

    render(<Page />)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Gone')).toBeInTheDocument()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Done.'))
    expect(success).toHaveBeenCalledTimes(1)
  })
})
