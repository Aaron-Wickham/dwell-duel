// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormSubmitButton } from '@/components/ui/form-submit-button'

function neverResolves() {
  return new Promise<void>(() => {})
}

describe('FormSubmitButton', () => {
  it('marks itself aria-disabled while its action is pending, without dropping disabled on the real attribute', async () => {
    render(
      <form action={neverResolves}>
        <FormSubmitButton>Place bet</FormSubmitButton>
      </form>,
    )
    const button = screen.getByRole('button', { name: 'Place bet' })
    expect(button).toBeEnabled()

    await userEvent.click(button)

    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).not.toBeDisabled()
  })

  it('keeps focus while pending, and blocks a second click from firing the action again', async () => {
    const action = vi.fn(neverResolves)
    render(
      <form action={action}>
        <FormSubmitButton>Place bet</FormSubmitButton>
      </form>,
    )
    const button = screen.getByRole('button', { name: 'Place bet' })

    await userEvent.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(action).toHaveBeenCalledOnce()
    expect(button).toHaveFocus()

    await userEvent.click(button)
    expect(action).toHaveBeenCalledOnce()
    expect(button).toHaveFocus()
  })

  it('forwards the caller\'s onClick when not pending', async () => {
    const onClick = vi.fn()
    render(
      <form action={neverResolves}>
        <FormSubmitButton onClick={onClick}>Place bet</FormSubmitButton>
      </form>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Place bet' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('stays disabled when the caller disables it, pending or not', () => {
    render(
      <form action={neverResolves}>
        <FormSubmitButton disabled>Place bet</FormSubmitButton>
      </form>,
    )
    expect(screen.getByRole('button', { name: 'Place bet' })).toBeDisabled()
  })
})
