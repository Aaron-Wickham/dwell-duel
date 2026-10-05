// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { noReactions, type EventReactions } from '@/lib/social/reactions'

const { setReactionAction, toastError } = vi.hoisted(() => ({ setReactionAction: vi.fn(), toastError: vi.fn() }))
vi.mock('@/lib/social/reactions-actions', () => ({ setReactionAction }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

import { ReactionBar } from '@/components/feed/reaction-bar'

const SOME: EventReactions = { ...noReactions(), fire: { count: 3, mine: true }, laugh: { count: 1, mine: false } }

beforeEach(() => {
  setReactionAction.mockReset()
  toastError.mockReset()
})

// Holds the action open, so the optimistic state can be seen before the server answers.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const bar = () => screen.getByRole('group', { name: 'Reactions' })

async function openPicker() {
  await userEvent.click(screen.getByRole('button', { name: 'React' }))
  return screen.findByRole('dialog', { name: 'React' })
}

describe('ReactionBar', () => {
  // #395: four empty buttons under every row drowned the sentences.
  it('shows only the reactions someone used, named by kind, count and whether you reacted, then React', () => {
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)

    const buttons = within(bar()).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'React fire, 3 reactions, you reacted',
      'React laugh, 1 reaction',
      'React',
    ])
    expect(buttons.slice(0, 2).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    expect(buttons.slice(0, 2).map((b) => b.textContent)).toEqual(['🔥3', '😂1'])
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button).toHaveClass('hit-area')
    }
  })

  it('gives an unselected reaction an edge that reads as a control (A11Y-07)', () => {
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)
    expect(screen.getByRole('button', { name: 'React laugh, 1 reaction' })).toHaveClass('border-line-s')
    expect(screen.getByRole('button', { name: 'React laugh, 1 reaction' })).not.toHaveClass('border-line')
  })

  it('shows only React when nobody has reacted', () => {
    render(<ReactionBar eventId="bet:1" reactions={noReactions()} />)
    expect(within(bar()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['React'])
  })

  it('opens all four reactions from React, each a toggle, and closes on Escape', async () => {
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)
    const picker = await openPicker()

    const choices = within(picker).getAllByRole('button', { name: /^React / })
    expect(choices.map((b) => b.getAttribute('aria-label'))).toEqual([
      'React fire, 3 reactions, you reacted',
      'React pray, 0 reactions',
      'React laugh, 1 reaction',
      'React clap, 0 reactions',
    ])
    expect(choices.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    for (const choice of choices) expect(choice).toHaveClass('size-11')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'React' })).toBeNull())
  })

  it('adds a reaction from the picker at once, before the server answers, and asks the server to add it', async () => {
    const pending = deferred<{ error?: string }>()
    setReactionAction.mockReturnValue(pending.promise)
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)

    const picker = await openPicker()
    await userEvent.click(within(picker).getByRole('button', { name: 'React pray, 0 reactions' }))

    const pray = await within(bar()).findByRole('button', { name: 'React pray, 1 reaction, you reacted' })
    expect(pray).toHaveAttribute('aria-pressed', 'true')
    expect(setReactionAction).toHaveBeenCalledWith('bet:1', 'pray', true)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'React' })).toBeNull())
    pending.resolve({})
  })

  it('takes your own reaction back at once from its pill', async () => {
    const pending = deferred<{ error?: string }>()
    setReactionAction.mockReturnValue(pending.promise)
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)

    await userEvent.click(screen.getByRole('button', { name: 'React fire, 3 reactions, you reacted' }))

    expect(await screen.findByRole('button', { name: 'React fire, 2 reactions' })).toHaveAttribute('aria-pressed', 'false')
    expect(setReactionAction).toHaveBeenCalledWith('bet:1', 'fire', false)
    pending.resolve({})
  })

  it('drops a pill whose last reaction was yours once you take it back', async () => {
    const pending = deferred<{ error?: string }>()
    setReactionAction.mockReturnValue(pending.promise)
    render(<ReactionBar eventId="bet:1" reactions={{ ...noReactions(), clap: { count: 1, mine: true } }} />)

    await userEvent.click(screen.getByRole('button', { name: 'React clap, 1 reaction, you reacted' }))

    await waitFor(() => expect(within(bar()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['React']))
    pending.resolve({})
  })

  it('falls back to the real counts and says so when the server refuses', async () => {
    setReactionAction.mockResolvedValue({ error: 'Couldn’t add your reaction. Try again.' })
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)

    const picker = await openPicker()
    await userEvent.click(within(picker).getByRole('button', { name: 'React clap, 0 reactions' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Couldn’t add your reaction. Try again.'))
    await waitFor(() => expect(within(bar()).queryByRole('button', { name: /React clap/ })).toBeNull())
  })

  it('follows new counts from the server', () => {
    const { rerender } = render(<ReactionBar eventId="bet:1" reactions={noReactions()} />)
    rerender(<ReactionBar eventId="bet:1" reactions={{ ...noReactions(), clap: { count: 4, mine: false } }} />)
    expect(screen.getByRole('button', { name: 'React clap, 4 reactions' })).toBeInTheDocument()
  })
})
