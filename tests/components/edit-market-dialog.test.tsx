// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { updateMarketAction } = vi.hoisted(() => ({ updateMarketAction: vi.fn() }))
vi.mock('@/lib/markets/update-market', () => ({ updateMarketAction }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { EditMarketDialog } from './edit-market-dialog-harness'
import { localInputValue } from '@/lib/markets/weekly-close'
import { formatDateTime } from '@/lib/markets/format-date'

const EDIT_PROPS = {
  marketId: 'm1',
  title: 'Will it snow?',
  category: 'Weather',
  closeAt: '2099-12-06T18:30:00.000Z',
  mode: 'edit' as const,
  suggestions: ['Weather'],
  popular: ['Weather'],
}

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
    // An untouched close time isn't sent, so saving never moves it.
    expect(sent.has('close_at')).toBe(false)
  })

  it('shows the close time, and asks first when it moves, saying the new time (#326)', async () => {
    updateMarketAction.mockResolvedValue({ saved: true })
    render(<EditMarketDialog {...EDIT_PROPS} description={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const close = await screen.findByLabelText('Close time')
    expect(close).toHaveValue(localInputValue(EDIT_PROPS.closeAt, Intl.DateTimeFormat().resolvedOptions().timeZone))

    await userEvent.clear(close)
    await userEvent.type(close, '2099-12-20T19:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Change the close time?' })
    const iso = new Date('2099-12-20T19:00').toISOString()
    expect(confirm).toHaveTextContent(formatDateTime(iso))
    expect(updateMarketAction).not.toHaveBeenCalled()

    await userEvent.click(within(confirm).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateMarketAction).toHaveBeenCalled())
    expect((updateMarketAction.mock.calls[0][2] as FormData).get('close_at')).toBe(iso)
  })

  it('leaves the close time out for a creator with a stake (#326)', async () => {
    render(<EditMarketDialog {...EDIT_PROPS} description={null} canMoveClose={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByLabelText('Title')).toBeInTheDocument()
    expect(screen.queryByLabelText('Close time')).toBeNull()
  })

  it('reopens a closed market with only a new close time, after confirming (#326)', async () => {
    updateMarketAction.mockResolvedValue({ saved: true })
    render(<EditMarketDialog {...EDIT_PROPS} description="Before noon" mode="reopen" />)
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    const close = await screen.findByLabelText('Close time')
    expect(close).toHaveValue('')
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.queryByLabelText('Category')).toBeNull()
    expect(screen.getByRole('dialog')).toHaveTextContent('Only reopen if the result isn’t known yet.')

    await userEvent.type(close, '2099-12-20T19:00')
    await userEvent.click(screen.getByRole('button', { name: 'Reopen market' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Reopen this market?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reopen market' }))
    await waitFor(() => expect(updateMarketAction).toHaveBeenCalled())
    const sent = updateMarketAction.mock.calls[0][2] as FormData
    expect([...sent.keys()]).toEqual(['close_at'])
    expect(sent.get('close_at')).toBe(new Date('2099-12-20T19:00').toISOString())
  })

  it('holds only the category once the market has closed, for an admin', async () => {
    updateMarketAction.mockResolvedValue({ saved: true })
    render(<EditMarketDialog {...EDIT_PROPS} description="Before noon" mode="category" />)
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
