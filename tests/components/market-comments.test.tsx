// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { MarketComment } from '@/lib/social/comments'
import type { Role } from '@/lib/auth/roles'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { listMarketComments, requestShowMoreFocus, role } = vi.hoisted(() => ({
  listMarketComments: vi.fn(),
  requestShowMoreFocus: vi.fn(),
  role: { current: 'member' as Role },
}))
vi.mock('@/lib/social/comments', () => ({ listMarketComments }))
vi.mock('@/lib/social/comments-actions', () => ({ postCommentAction: vi.fn(), deleteCommentAction: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: {}, user: { id: 'p-me' } }) }))
vi.mock('@/lib/auth/roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/roles')>()),
  getRole: async () => role.current,
}))
vi.mock('@/components/ui/show-more-focus', () => ({ ShowMoreFocus: () => null, requestShowMoreFocus }))
vi.mock('next/link', () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({
    href,
    scroll,
    replace: _replace,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; onNavigate?: () => void }) => (
    <a
      href={href}
      data-scroll={String(scroll ?? true)}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

// An async Server Component the market page streams behind a <Suspense>, so it's rendered directly.
import { MarketComments } from '@/app/(app)/markets/[id]/market-comments'

const comment = (id: number, profileId: string, authorName: string, body: string): MarketComment => ({
  id,
  body,
  // Recent, so each shows a relative age.
  createdAt: new Date(Date.now() - (10 - id) * 60_000).toISOString(),
  profileId,
  authorName,
  authorAvatarSrc: null,
})

async function renderComments(page: KeysetPage<MarketComment>, searchParams: Record<string, string> = {}) {
  listMarketComments.mockResolvedValue(page)
  render(await MarketComments({ marketId: 'm-1', viewerId: 'p-me', page: { top: null, bottom: null }, searchParams }))
}

beforeEach(() => {
  listMarketComments.mockReset()
  requestShowMoreFocus.mockReset()
  role.current = 'member'
})

describe('MarketComments', () => {
  it('shows an empty state and the form when nobody has commented', async () => {
    await renderComments({ rows: [], next: null, windowed: false })
    expect(screen.getByRole('heading', { name: 'Comments' })).toBeInTheDocument()
    expect(screen.getByText('No comments yet.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toBeInTheDocument()
  })

  it('lists the thread oldest first, newest last, with each author and a relative time', async () => {
    // listMarketComments hands them back newest first.
    await renderComments({
      rows: [comment(3, 'p-me', 'Alice', 'Third'), comment(2, 'p-bob', 'Bob', 'Second'), comment(1, 'p-bob', 'Bob', 'First')],
      next: null,
      windowed: false,
    })
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.whitespace-pre-line')?.textContent)).toEqual(['First', 'Second', 'Third'])
    expect(items[2]).toHaveTextContent('Alice (you)')
    // Named by author and text, leaving out the Delete button.
    expect(items[2]).toHaveAccessibleName('Alice (you) Third')
    expect(items[0]).toHaveTextContent('Bob')
    expect(items[0]).toHaveTextContent(/\dm ago/)
  })

  it('lets a member delete only their own comments', async () => {
    await renderComments({
      rows: [comment(2, 'p-me', 'Alice', 'Mine'), comment(1, 'p-bob', 'Bob', 'Theirs')],
      next: null,
      windowed: false,
    })
    expect(screen.getByRole('button', { name: 'Delete your comment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Bob’s comment' })).toBeNull()
  })

  it.each<Role>(['admin', 'owner'])('lets an %s delete anyone’s comment, for moderation', async (r) => {
    role.current = r
    await renderComments({ rows: [comment(1, 'p-bob', 'Bob', 'Theirs')], next: null, windowed: false })
    expect(screen.getByRole('button', { name: 'Delete Bob’s comment' })).toBeInTheDocument()
  })

  it('keeps a reviewer to their own comments', async () => {
    role.current = 'reviewer'
    await renderComments({ rows: [comment(1, 'p-bob', 'Bob', 'Theirs')], next: null, windowed: false })
    expect(screen.queryByRole('button', { name: 'Delete Bob’s comment' })).toBeNull()
  })

  it('puts "Show more" for older comments above the thread, focusing the first row it brings in', async () => {
    await renderComments({
      rows: [comment(9, 'p-bob', 'Bob', 'Latest')],
      next: { kind: 'extend', cursor: 'NEXT', firstId: '8' },
      windowed: false,
    })
    const showMore = screen.getByRole('link', { name: 'Show more' })
    expect(showMore).toHaveAttribute('href', '/markets/m-1?comments=NEXT')
    expect(showMore).toHaveAccessibleDescription('Older comments')
    expect(showMore.compareDocumentPosition(screen.getByRole('list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(showMore)
    expect(requestShowMoreFocus).toHaveBeenCalledWith('comment-8')
  })

  it('says there is nothing older, not that nobody has commented, for a window past the end', async () => {
    await renderComments({ rows: [], next: null, windowed: true }, { comments_from: 'OLD' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/markets/m-1')
    expect(screen.queryByText('No comments yet.')).toBeNull()
  })
})
