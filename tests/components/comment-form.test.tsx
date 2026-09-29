// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { postCommentAction, success } = vi.hoisted(() => ({ postCommentAction: vi.fn(), success: vi.fn() }))
vi.mock('@/lib/social/comments-actions', () => ({ postCommentAction }))
vi.mock('sonner', () => ({ toast: { success } }))

import { CommentForm } from '@/components/markets/comment-form'

beforeEach(() => {
  postCommentAction.mockReset()
  success.mockReset()
})

describe('CommentForm', () => {
  it('is a labelled textarea capped at 280 characters, with a real submit button', () => {
    render(<CommentForm marketId="m1" />)
    const box = screen.getByRole('textbox', { name: 'Add a comment' })
    expect(box).toHaveAttribute('maxLength', '280')
    expect(box).toHaveAttribute('name', 'body')
    expect(box).toHaveAccessibleDescription('Up to 280 characters.')
    expect(box).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'Post comment' })).toHaveAttribute('type', 'submit')
  })

  it('posts the comment for this market and clears the box once it has been saved', async () => {
    postCommentAction.mockResolvedValue({ posted: true })
    render(<CommentForm marketId="m1" />)
    const box = screen.getByRole('textbox', { name: 'Add a comment' })

    await userEvent.type(box, 'Yes is a lock')
    await userEvent.click(screen.getByRole('button', { name: 'Post comment' }))

    await waitFor(() => expect(box).toHaveValue(''))
    expect(postCommentAction).toHaveBeenCalledTimes(1)
    const [marketId, , formData] = postCommentAction.mock.calls[0]
    expect(marketId).toBe('m1')
    expect((formData as FormData).get('body')).toBe('Yes is a lock')
    expect(success).toHaveBeenCalledWith('Comment posted.')
  })

  it('keeps the draft and marks the box invalid when the server refuses it', async () => {
    postCommentAction.mockResolvedValue({ formError: 'A comment can be at most 280 characters.' })
    render(<CommentForm marketId="m1" />)
    const box = screen.getByRole('textbox', { name: 'Add a comment' })

    await userEvent.type(box, 'Keep me')
    await userEvent.click(screen.getByRole('button', { name: 'Post comment' }))

    await screen.findByText('A comment can be at most 280 characters.')
    expect(document.getElementById('comment-error')).toHaveTextContent('A comment can be at most 280 characters.')
    expect(box).toHaveValue('Keep me')
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAttribute('aria-describedby', 'comment-body-hint comment-error')
    expect(success).not.toHaveBeenCalled()
  })
})
