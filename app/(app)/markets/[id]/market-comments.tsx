import { MessageCircle } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { listMarketComments } from '@/lib/social/comments'
import { isOldEntry, relativeTime } from '@/lib/social/relative-time'
import { newestHref, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'
import { ContentReveal } from '@/components/nav/page-transition'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { LocalTime } from '@/components/ui/local-time'
import { NothingOlder } from '@/components/ui/nothing-older'
import { SectionCard } from '@/components/ui/section-card'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { CommentForm } from '@/components/markets/comment-form'
import { DeleteCommentButton } from '@/components/markets/delete-comment-button'

export const COMMENT_ROW_ID_PREFIX = 'comment'

// The newest 50 comments, oldest at the top so the thread reads down to the latest, with
// "Show more" above them for older ones. It pages like every other list (lib/pagination), newest
// first under the hood, and is only shown reversed. The market page's one <ShowMoreFocus /> lives
// in the bets section.
//
// Exported so tests can render this section directly: it's an async Server Component inside a
// <Suspense>, which jsdom can't render in place.
export async function MarketComments({
  marketId,
  viewerId,
  page,
  searchParams,
}: {
  marketId: string
  viewerId: string
  page: PageParams
  searchParams: SearchParams
}) {
  const { supabase } = await requireUser()
  const [comments, role] = await Promise.all([listMarketComments(supabase, marketId, page), getRole(supabase)])
  const moderator = atLeast(role, 'admin')
  const pathname = `/markets/${marketId}`
  const backToNewestHref = newestHref(pathname, searchParams, 'comments')
  const thread = [...comments.rows].reverse()
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  return (
    <ContentReveal>
      <SectionCard title="Comments" titleId="comments-title" className="gap-3">
        {comments.next && (
          <div className="flex flex-col">
            <ShowMore
              href={showMoreHref(pathname, searchParams, 'comments', comments.next)}
              fresh={comments.next.kind === 'window'}
              focusId={rowDomId(COMMENT_ROW_ID_PREFIX, comments.next.firstId)}
              description="Older comments"
            />
          </div>
        )}
        {comments.windowed && thread.length === 0 ? (
          <NothingOlder href={backToNewestHref} />
        ) : thread.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No comments yet.">
            Say what you think, or ask how it’ll be decided.
          </EmptyState>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {thread.map((c) => {
              const own = c.profileId === viewerId
              const domId = rowDomId(COMMENT_ROW_ID_PREFIX, c.id)
              // Named by its author and text, not the whole row, which would add the Delete button.
              return (
                <li key={c.id} {...focusTarget(domId, `${domId}-author ${domId}-body`)} className="flex items-start gap-3 py-3">
                  <Avatar name={c.authorName} src={c.authorAvatarSrc} size="sm" />
                  <div className="flex min-w-0 grow flex-col gap-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span id={`${domId}-author`} className="font-bold text-ink">{own ? `${c.authorName} (you)` : c.authorName}</span>
                      <span className="text-ink2">
                        {isOldEntry(c.createdAt, now) ? <LocalTime iso={c.createdAt} format="day" /> : relativeTime(c.createdAt, now)}
                      </span>
                    </p>
                    <p id={`${domId}-body`} className="whitespace-pre-line break-words">
                      {c.body}
                    </p>
                  </div>
                  {(own || moderator) && <DeleteCommentButton commentId={c.id} authorName={c.authorName} own={own} />}
                </li>
              )
            })}
          </ol>
        )}
        {comments.windowed && thread.length > 0 && (
          <div className="flex flex-col">
            <BackToNewest href={backToNewestHref} />
          </div>
        )}
        <div className="border-t border-line pt-3">
          <CommentForm marketId={marketId} />
        </div>
      </SectionCard>
    </ContentReveal>
  )
}
