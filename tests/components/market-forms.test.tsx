// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { resolveMarketAction, uploadProof, discardProof } = vi.hoisted(() => ({
  resolveMarketAction: vi.fn(),
  uploadProof: vi.fn(),
  discardProof: vi.fn(),
}))
vi.mock('@/lib/markets/resolve-market', () => ({ resolveMarketAction }))
vi.mock('@/lib/proof/upload', () => ({ uploadProof, discardProof }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { ResolveForm } from '@/app/(app)/markets/[id]/resolve-form'

async function resolveAndConfirm() {
  await userEvent.click(screen.getByRole('button', { name: 'Resolve market' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm outcome' }))
}

const outcomes = [
  { id: 'o-yes', label: 'Yes' },
  { id: 'o-no', label: 'No' },
]

beforeEach(() => {
  resolveMarketAction.mockReset()
  uploadProof.mockReset().mockResolvedValue([])
  discardProof.mockReset().mockResolvedValue(undefined)
})

describe('ResolveForm', () => {
  it('starts on a placeholder, so the winner is always a deliberate choice', () => {
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    const select = screen.getByRole('combobox', { name: 'Winning outcome' })
    expect(select).toHaveAttribute('name', 'outcome_id')
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Choose the winner…' })).toBeDisabled()
  })

  it('ties a server error about the winner to the outcome select', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'market not found', field: 'outcome' })
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Final score 3–1')
    await resolveAndConfirm()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('id', 'resolve-error')
    const select = screen.getByRole('combobox', { name: 'Winning outcome' })
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('market not found')
    expect(resolveMarketAction.mock.calls[0][2].get('outcome_id')).toBe('o-yes')
    expect(resolveMarketAction.mock.calls[0][2].get('note')).toBe('Final score 3–1')
  })

  it('ties a note error to the note, not the outcome', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'Say why this outcome won.', field: 'note' })
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), ' ')
    await resolveAndConfirm()

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('combobox', { name: 'Winning outcome' })).toHaveAttribute('aria-invalid', 'false')
  })

  it('marks neither field for an error that is about neither (#219)', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'Your attachments didn’t come through. Try again.' })
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Final score 3–1')
    await resolveAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('Your attachments didn’t come through. Try again.')
    expect(screen.getByRole('combobox', { name: 'Winning outcome' })).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveAttribute('aria-invalid', 'false')
  })

  it('marks neither field of an over/under for an error that is about neither (#219)', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'Not signed in.' })
    render(<ResolveForm marketId="m1" outcomes={[{ id: 'o', label: 'Over 3.5' }, { id: 'u', label: 'Under 3.5' }]} line={3.5} />)
    await userEvent.type(screen.getByLabelText('Actual result'), '4')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Counted')
    await resolveAndConfirm()

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Actual result')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('ResolveForm over/under', () => {
  it('asks for the actual result and previews which side wins', async () => {
    render(<ResolveForm marketId="m1" outcomes={[{ id: 'o', label: 'Over 3.5' }, { id: 'u', label: 'Under 3.5' }]} line={3.5} />)
    expect(screen.queryByRole('combobox', { name: 'Winning outcome' })).not.toBeInTheDocument()
    const actual = screen.getByLabelText('Actual result')
    await userEvent.type(actual, '5')
    expect(screen.getByText('Over 3.5 wins.')).toBeInTheDocument()
    await userEvent.clear(actual)
    await userEvent.type(actual, '2')
    expect(screen.getByText('Under 3.5 wins.')).toBeInTheDocument()
  })

  it('sends the actual result with the reason', async () => {
    resolveMarketAction.mockResolvedValue(undefined)
    render(<ResolveForm marketId="m1" outcomes={[{ id: 'o', label: 'Over 3.5' }, { id: 'u', label: 'Under 3.5' }]} line={3.5} />)
    await userEvent.type(screen.getByLabelText('Actual result'), '4')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Counted on the recording')
    await resolveAndConfirm()
    await vi.waitFor(() => expect(resolveMarketAction).toHaveBeenCalled())
    const data = resolveMarketAction.mock.calls[0][2] as FormData
    expect(data.get('actual')).toBe('4')
    expect(data.get('outcome_id')).toBeNull()
  })
})

describe('ResolveForm keeps what was filled in (#63)', () => {
  it('keeps the winner and the reason after the server refuses', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'market not found', field: 'outcome' })
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'No')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Rained out')
    await resolveAndConfirm()

    await screen.findByRole('alert')
    expect(screen.getByRole('combobox', { name: 'Winning outcome' })).toHaveValue('o-no')
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveValue('Rained out')
  })

  it('keeps the actual result of an over/under after the server refuses', async () => {
    resolveMarketAction.mockResolvedValue({ formError: 'market not found', field: 'outcome' })
    render(<ResolveForm marketId="m1" outcomes={[{ id: 'o', label: 'Over 3.5' }, { id: 'u', label: 'Under 3.5' }]} line={3.5} />)
    await userEvent.type(screen.getByLabelText('Actual result'), '4')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Counted')
    await resolveAndConfirm()

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Actual result')).toHaveValue(4)
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveValue('Counted')
  })
})

describe('ResolveForm confirmation (#64)', () => {
  it('names the winner and pays nothing until confirmed', async () => {
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Sunny all day')
    await userEvent.click(screen.getByRole('button', { name: 'Resolve market' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Resolve this market?' })
    expect(dialog).toHaveAccessibleDescription('Yes wins. Winning bets and parlay legs are paid out straight away.')
    expect(resolveMarketAction).not.toHaveBeenCalled()
  })

  it('keeps the form exactly as filled in on Cancel, without resolving', async () => {
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'No')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Rained out')
    await userEvent.click(screen.getByRole('button', { name: 'Resolve market' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(resolveMarketAction).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Winning outcome' })).toHaveValue('o-no')
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveValue('Rained out')
  })

  it('resolves once confirmed, sending the chosen winner, and closes the dialog', async () => {
    resolveMarketAction.mockResolvedValue(undefined)
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Sunny all day')
    await resolveAndConfirm()

    await waitFor(() => expect(resolveMarketAction).toHaveBeenCalledOnce())
    expect(resolveMarketAction.mock.calls[0][2].get('outcome_id')).toBe('o-yes')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('closes the dialog and shows the error when an attachment fails to upload (#199)', async () => {
    uploadProof.mockRejectedValue(new Error('proof.jpg is too large.'))
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Sunny all day')
    await resolveAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('proof.jpg is too large.')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(resolveMarketAction).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Winning outcome' })).toHaveValue('o-yes')
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveValue('Sunny all day')
  })

  it('still shows the server error when cleaning up the uploaded proof fails (#199)', async () => {
    uploadProof.mockResolvedValue([{ kind: 'image', storage_path: 'resolution/m1/a.jpg', file_name: 'a.jpg', size_bytes: 1 }])
    discardProof.mockRejectedValue(new Error('storage is down'))
    resolveMarketAction.mockResolvedValue({ formError: 'Two members are 12 DC short.', field: 'outcome' })
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'Yes')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Sunny all day')
    await resolveAndConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent('Two members are 12 DC short.')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(discardProof).toHaveBeenCalledOnce()
  })

  it('clears the winner and the reason once an override goes through, ready for the next one (#221)', async () => {
    resolveMarketAction.mockResolvedValue(undefined)
    render(<ResolveForm marketId="m1" outcomes={outcomes} override />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'No')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Recount')
    await userEvent.click(screen.getByRole('button', { name: 'Override resolution' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm outcome' }))

    await waitFor(() => expect(resolveMarketAction).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Winning outcome' })).toHaveValue(''))
    expect(screen.getByLabelText('Why did this outcome win?')).toHaveValue('')
  })

  it('does not open the confirmation until the form is filled in', async () => {
    render(<ResolveForm marketId="m1" outcomes={outcomes} />)
    await userEvent.click(screen.getByRole('button', { name: 'Resolve market' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('says an override reverses the previous payouts', async () => {
    render(<ResolveForm marketId="m1" outcomes={outcomes} override />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Winning outcome' }), 'No')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Recount')
    await userEvent.click(screen.getByRole('button', { name: 'Override resolution' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Override the resolution?' })
    expect(dialog).toHaveAccessibleDescription(
      'No wins. The previous payouts are reversed, then winning bets and parlay legs are paid out on this outcome.',
    )
    expect(resolveMarketAction).not.toHaveBeenCalled()
  })

  it('names the over/under side the actual result makes the winner', async () => {
    render(<ResolveForm marketId="m1" outcomes={[{ id: 'o', label: 'Over 42.5' }, { id: 'u', label: 'Under 42.5' }]} line={42.5} />)
    await userEvent.type(screen.getByLabelText('Actual result'), '47')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Timed it')
    await userEvent.click(screen.getByRole('button', { name: 'Resolve market' }))

    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(expect.stringMatching(/^Over 42\.5 wins\./))
    expect(resolveMarketAction).not.toHaveBeenCalled()
  })

  it('refuses an actual result equal to the line before asking', async () => {
    render(<ResolveForm marketId="m1" outcomes={[{ id: 'o', label: 'Over 3' }, { id: 'u', label: 'Under 3' }]} line={3} />)
    await userEvent.type(screen.getByLabelText('Actual result'), '3')
    await userEvent.type(screen.getByLabelText('Why did this outcome win?'), 'Tied')
    await userEvent.click(screen.getByRole('button', { name: 'Resolve market' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByLabelText('Actual result')).toBeInvalid()
  })
})
