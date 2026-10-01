// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { voidMarketAction } = vi.hoisted(() => ({ voidMarketAction: vi.fn() }))
vi.mock('@/lib/markets/void-market', () => ({ voidMarketAction }))

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

import { VoidForm } from '@/app/(app)/markets/[id]/void-form'

beforeEach(() => {
  voidMarketAction.mockReset()
  success.mockReset()
})

const reasonField = () => screen.getByRole('textbox', { name: 'Why void this market?' })

async function confirmVoid(reason = 'The sermon was cancelled.') {
  await userEvent.type(reasonField(), reason)
  await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Void market' }))
}

describe('VoidForm', () => {
  it('asks why, with its limit and hint, before any dialog', () => {
    render(<VoidForm marketId="m1" />)
    const field = reasonField()
    expect(field).toBeRequired()
    expect(field).toHaveAttribute('maxlength', '500')
    expect(field).toHaveAttribute('aria-describedby', 'void-reason-hint')
    expect(screen.getByText('Everyone sees this. Voiding refunds every bet and parlay leg.')).toHaveAttribute('id', 'void-reason-hint')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('opens an alert dialog with the approved copy, focusing Cancel first', async () => {
    render(<VoidForm marketId="m1" />)
    await userEvent.type(reasonField(), 'Duplicate market')
    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Void this market?' })
    expect(dialog).toHaveAccessibleDescription('Every bet and parlay leg is refunded. This can’t be undone.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Void market' })).toHaveAttribute('type', 'submit')
    expect(screen.getByRole('button', { name: 'Void market' })).toHaveAttribute('form', 'void-form')
  })

  it('keeps the reason and voids nothing on Cancel', async () => {
    render(<VoidForm marketId="m1" />)
    await userEvent.type(reasonField(), 'Duplicate market')
    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(reasonField()).toHaveValue('Duplicate market')
    expect(voidMarketAction).not.toHaveBeenCalled()
  })

  it('sends the reason, and marks the field when the reason is the problem, keeping what was typed', async () => {
    voidMarketAction.mockResolvedValue({ formError: 'Reason can be at most 500 characters.', field: 'reason' })
    render(<VoidForm marketId="m1" />)

    await confirmVoid('Too long, say')

    expect(await screen.findByRole('alert')).toHaveTextContent('Reason can be at most 500 characters.')
    const formData = voidMarketAction.mock.calls[0][2] as FormData
    expect(voidMarketAction.mock.calls[0][0]).toBe('m1')
    expect(formData.get('reason')).toBe('Too long, say')
    expect(reasonField()).toHaveAttribute('aria-invalid', 'true')
    expect(reasonField()).toHaveAttribute('aria-describedby', 'void-reason-hint void-error')
    expect(reasonField()).toHaveValue('Too long, say')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(success).not.toHaveBeenCalled()
  })

  it('points the button at an error that isn’t about the reason', async () => {
    voidMarketAction.mockResolvedValue({ formError: 'This market has closed, so only an admin can void it.' })
    render(<VoidForm marketId="m1" />)

    await confirmVoid()

    expect(await screen.findByRole('alert')).toHaveTextContent('This market has closed, so only an admin can void it.')
    expect(reasonField()).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByRole('button', { name: 'Void this market' })).toHaveAttribute('aria-describedby', 'void-error')
  })

  it('toasts once and returns focus to the page heading once the parent stops rendering the form', async () => {
    voidMarketAction.mockResolvedValue(undefined)
    const { rerender } = render(
      <>
        <h1>Will it rain on the church picnic?</h1>
        <VoidForm marketId="m1" />
      </>,
    )

    await confirmVoid()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Market voided.'))
    expect(success).toHaveBeenCalledTimes(1)

    // A real void revalidates the page, which then stops rendering this form.
    rerender(
      <>
        <h1>Will it rain on the church picnic?</h1>
      </>,
    )
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
  })
})
