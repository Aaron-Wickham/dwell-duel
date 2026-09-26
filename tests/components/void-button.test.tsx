// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { voidMarketAction } = vi.hoisted(() => ({ voidMarketAction: vi.fn() }))
vi.mock('@/lib/markets/void-market', () => ({ voidMarketAction }))

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

import { VoidButton } from '@/app/(app)/markets/[id]/void-button'

beforeEach(() => {
  voidMarketAction.mockReset()
  success.mockReset()
})

async function confirmVoid() {
  await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Void market' }))
}

describe('VoidButton', () => {
  it('describes itself by the hint alone before any error, with no dialog rendered', () => {
    render(<VoidButton marketId="m1" />)
    expect(screen.getByRole('button', { name: 'Void this market' })).toHaveAttribute('aria-describedby', 'void-hint')
    expect(screen.getByText('Voiding refunds every bet and parlay leg.')).toHaveAttribute('id', 'void-hint')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Void market' })).toBeNull()
  })

  it('opens an alert dialog with the approved copy, focusing Cancel first', async () => {
    render(<VoidButton marketId="m1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Void this market?' })
    expect(dialog).toHaveAccessibleDescription('Every bet and parlay leg is refunded. This can’t be undone.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Void market' })).toHaveAttribute('type', 'submit')
  })

  it('closes on Cancel and on Escape without voiding, returning focus to the trigger', async () => {
    render(<VoidButton marketId="m1" />)
    const trigger = screen.getByRole('button', { name: 'Void this market' })

    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await screen.findByRole('alertdialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(trigger).toHaveFocus()

    expect(voidMarketAction).not.toHaveBeenCalled()
  })

  it('stays open when the member presses outside it', async () => {
    render(<VoidButton marketId="m1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
    await screen.findByRole('alertdialog')

    await userEvent.click(document.body)

    expect(screen.getByRole('alertdialog', { name: 'Void this market?' })).toBeInTheDocument()
  })

  it('ignores Cancel and Escape while the void is in flight, then resumes once it settles', async () => {
    let resolveAction: (value: { formError: string }) => void = () => {}
    voidMarketAction.mockImplementation(
      () => new Promise((resolve) => { resolveAction = resolve }),
    )
    render(<VoidButton marketId="m1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Void market' }))

    const dialog = await screen.findByRole('alertdialog')
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(cancel).toHaveAttribute('aria-disabled', 'true'))

    await userEvent.click(cancel)
    expect(dialog).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(dialog).toBeInTheDocument()

    resolveAction({ formError: 'Could not void that market.' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not void that market.')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    const trigger = screen.getByRole('button', { name: 'Void this market' })
    expect(trigger).toHaveAttribute('aria-describedby', 'void-hint void-error')
  })

  it('adds the error id alongside the hint once voiding fails, closing the dialog', async () => {
    voidMarketAction.mockResolvedValue({ formError: 'Could not void that market.' })
    render(<VoidButton marketId="m1" />)

    await confirmVoid()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not void that market.')
    expect(voidMarketAction).toHaveBeenCalledWith('m1', undefined, expect.any(FormData))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    const trigger = screen.getByRole('button', { name: 'Void this market' })
    expect(trigger).toHaveAttribute('aria-describedby', 'void-hint void-error')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('returns focus to the page heading, not the body, once the parent stops rendering the voided button', async () => {
    voidMarketAction.mockResolvedValue(undefined)
    const { rerender } = render(
      <>
        <h1>Will it rain on the church picnic?</h1>
        <VoidButton marketId="m1" />
      </>,
    )

    await confirmVoid()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Market voided.'))

    // A real void revalidates the page: the market can no longer be voided, so the parent
    // stops rendering this button (and its trigger) once the new server data arrives. The
    // heading stays mounted throughout, as it does on the real page -- only the button goes.
    rerender(
      <>
        <h1>Will it rain on the church picnic?</h1>
      </>,
    )
    // Base UI restores focus in a microtask after the popup unmounts.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
  })

  it('toasts once voiding succeeds', async () => {
    voidMarketAction.mockResolvedValue(undefined)
    render(<VoidButton marketId="m1" />)

    await confirmVoid()

    await waitFor(() => expect(success).toHaveBeenCalledWith('Market voided.'))
    // Kept from Task 5's fix round: guards against a double toast if the action re-fires.
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('does not toast when voiding fails', async () => {
    voidMarketAction.mockResolvedValue({ formError: 'Could not void that market.' })
    render(<VoidButton marketId="m1" />)

    await confirmVoid()
    await screen.findByRole('alert')

    expect(success).not.toHaveBeenCalled()
  })
})
