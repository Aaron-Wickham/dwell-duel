// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormSubmitButton } from '@/components/ui/form-submit-button'

function neverResolves() {
  return new Promise<void>(() => {})
}

describe('FormSubmitButton', () => {
  it('disables itself while its action is pending, to stop a double submit', async () => {
    render(
      <form action={neverResolves}>
        <FormSubmitButton>Place bet</FormSubmitButton>
      </form>,
    )
    const button = screen.getByRole('button', { name: 'Place bet' })
    expect(button).toBeEnabled()

    await userEvent.click(button)

    await waitFor(() => expect(button).toBeDisabled())
    expect(button).toHaveAttribute('aria-disabled', 'true')
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
