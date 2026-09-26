// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOptimistic, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastActionForm } from '@/components/ui/toast-action-form'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

beforeEach(() => {
  success.mockReset()
})

describe('ToastActionForm', () => {
  it('calls the wrapped action and toasts once it resolves', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <ToastActionForm action={action} successMessage="Added.">
        <button type="submit">Add</button>
      </ToastActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Added.'))
  })

  it('passes the submitted FormData to the action', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <ToastActionForm action={action} successMessage="Added.">
        <input type="hidden" name="outcomeId" value="o1" />
        <button type="submit">Add</button>
      </ToastActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const formData = action.mock.calls[0][0] as FormData
    expect(formData.get('outcomeId')).toBe('o1')
  })

  it('does not toast when the action resolves false', async () => {
    const action = vi.fn().mockResolvedValue(false)
    render(
      <ToastActionForm action={action} successMessage="Added.">
        <button type="submit">Add</button>
      </ToastActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(success).not.toHaveBeenCalled()
  })

  it('still toasts when the action’s success removes the form', async () => {
    function Row() {
      const [added, setAdded] = useState(false)
      if (added) return <p>In the slip</p>
      return (
        <ToastActionForm action={async () => setAdded(true)} successMessage="Added.">
          <button type="submit">Add</button>
        </ToastActionForm>
      )
    }

    render(<Row />)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('In the slip')).toBeInTheDocument()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Added.'))
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('runs the optimistic update inside the action, so it shows until the action settles', async () => {
    let finish!: (value: boolean) => void
    const action = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    function Row() {
      const [label, setLabel] = useOptimistic('Idle')
      return (
        <ToastActionForm action={action} successMessage="Added." optimistic={() => setLabel('Adding')}>
          <p>{label}</p>
          <button type="submit">Add</button>
        </ToastActionForm>
      )
    }

    render(<Row />)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('Adding')).toBeInTheDocument()
    expect(action).toHaveBeenCalledTimes(1)

    await act(async () => finish(false))
    expect(screen.getByText('Idle')).toBeInTheDocument()
    expect(success).not.toHaveBeenCalled()
  })
})
