// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

describe('ReactionBar', () => {
  it('shows all four reactions as toggle buttons named by kind, count and whether you reacted', () => {
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'React fire, 3 reactions, you reacted',
      'React pray, 0 reactions',
      'React laugh, 1 reaction',
      'React clap, 0 reactions',
    ])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    expect(buttons.map((b) => b.textContent)).toEqual(['🔥3', '🙏', '😂1', '👏'])
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button).toHaveClass('min-h-11')
    }
    expect(screen.getByRole('group', { name: 'Reactions' })).toBeInTheDocument()
  })

  it('adds a reaction at once, before the server answers, and asks the server to add it', async () => {
    const pending = deferred<{ error?: string }>()
    setReactionAction.mockReturnValue(pending.promise)
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)

    await userEvent.click(screen.getByRole('button', { name: 'React pray, 0 reactions' }))

    const pray = await screen.findByRole('button', { name: 'React pray, 1 reaction, you reacted' })
    expect(pray).toHaveAttribute('aria-pressed', 'true')
    expect(setReactionAction).toHaveBeenCalledWith('bet:1', 'pray', true)
    pending.resolve({})
  })

  it('takes your own reaction back at once', async () => {
    const pending = deferred<{ error?: string }>()
    setReactionAction.mockReturnValue(pending.promise)
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)

    await userEvent.click(screen.getByRole('button', { name: 'React fire, 3 reactions, you reacted' }))

    expect(await screen.findByRole('button', { name: 'React fire, 2 reactions' })).toHaveAttribute('aria-pressed', 'false')
    expect(setReactionAction).toHaveBeenCalledWith('bet:1', 'fire', false)
    pending.resolve({})
  })

  it('falls back to the real counts and says so when the server refuses', async () => {
    setReactionAction.mockResolvedValue({ error: 'Couldn’t add your reaction. Try again.' })
    render(<ReactionBar eventId="bet:1" reactions={SOME} />)

    await userEvent.click(screen.getByRole('button', { name: 'React clap, 0 reactions' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Couldn’t add your reaction. Try again.'))
    expect(await screen.findByRole('button', { name: 'React clap, 0 reactions' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('follows new counts from the server', () => {
    const { rerender } = render(<ReactionBar eventId="bet:1" reactions={noReactions()} />)
    rerender(<ReactionBar eventId="bet:1" reactions={{ ...noReactions(), clap: { count: 4, mine: false } }} />)
    expect(screen.getByRole('button', { name: 'React clap, 4 reactions' })).toBeInTheDocument()
  })
})
