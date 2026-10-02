// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { updateMarketAction } = vi.hoisted(() => ({ updateMarketAction: vi.fn() }))
vi.mock('@/lib/markets/update-market', () => ({ updateMarketAction }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { EditMarketDialog } from '@/app/(app)/markets/[id]/edit-market-dialog'

const EDIT_PROPS = { marketId: 'm1', title: 'Will it snow?', category: 'Weather', wording: true, suggestions: ['Weather'], popular: ['Weather'] }

beforeEach(() => updateMarketAction.mockReset())

describe('EditMarketDialog', () => {
  it('prefills the title and description, caps them, and saves the new text', async () => {
    updateMarketAction.mockResolvedValue({ saved: true })
    render(<EditMarketDialog {...EDIT_PROPS} description={null} />)
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
    render(<EditMarketDialog {...EDIT_PROPS} description="Before noon" />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('sends the category with the wording, the busiest category one tap away (#327)', async () => {
    updateMarketAction.mockResolvedValue({ saved: true })
    render(<EditMarketDialog {...EDIT_PROPS} description={null} popular={['Weather', 'Sports']} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByLabelText('Category')).toHaveValue('Weather')
    await userEvent.click(screen.getByRole('button', { name: 'Sports' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateMarketAction).toHaveBeenCalled())
    const sent = updateMarketAction.mock.calls[0][2] as FormData
    expect(sent.get('category')).toBe('Sports')
    expect(sent.get('title')).toBe('Will it snow?')
  })

  it('holds only the category once the market has closed, for an admin', async () => {
    updateMarketAction.mockResolvedValue({ saved: true })
    render(<EditMarketDialog {...EDIT_PROPS} description="Before noon" wording={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit category' }))
    expect(await screen.findByLabelText('Category')).toHaveValue('Weather')
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.getByRole('dialog')).toHaveTextContent('This market has closed, so only its category can change.')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateMarketAction).toHaveBeenCalled())
    const sent = updateMarketAction.mock.calls[0][2] as FormData
    expect(sent.has('title')).toBe(false)
    expect(sent.get('category')).toBe('Weather')
  })
})
