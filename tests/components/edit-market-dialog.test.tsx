// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { updateMarketAction } = vi.hoisted(() => ({ updateMarketAction: vi.fn() }))
vi.mock('@/lib/markets/update-market', () => ({ updateMarketAction }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { EditMarketDialog } from '@/app/(app)/markets/[id]/edit-market-dialog'

beforeEach(() => updateMarketAction.mockReset())

describe('EditMarketDialog', () => {
  it('prefills the title and description, caps them, and saves the new text', async () => {
    updateMarketAction.mockResolvedValue({ saved: true })
    render(<EditMarketDialog marketId="m1" title="Will it snow?" description={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const title = await screen.findByLabelText('Title')
    expect(title).toHaveValue('Will it snow?')
    expect(title).toHaveAttribute('maxlength', '120')
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '1000')

    await userEvent.clear(title)
    await userEvent.type(title, 'Will it snow on Sunday?')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateMarketAction).toHaveBeenCalled())
    expect(updateMarketAction.mock.calls[0][0]).toBe('m1')
    expect((updateMarketAction.mock.calls[0][2] as FormData).get('title')).toBe('Will it snow on Sunday?')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dialog open with the error tied to its field', async () => {
    updateMarketAction.mockResolvedValue({ formError: 'Title can be at most 120 characters.', field: 'title' })
    render(<EditMarketDialog marketId="m1" title="Will it snow?" description="Before noon" />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
