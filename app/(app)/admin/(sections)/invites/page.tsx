import { redirect } from 'next/navigation'
import { Mail } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { countInvites, listInvitesPage, readInvitePageParams } from '@/lib/invites/list-invites'
import { newestHref, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { readSearchQuery } from '@/lib/search/query'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { SearchField } from '@/components/ui/search-field'
import { SearchSummary } from '@/components/ui/search-summary'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { SubNav } from '@/components/ui/sub-nav'
import { ContentReveal } from '@/components/nav/page-transition'
import { InviteListItem } from '@/components/admin/invite-list-item'
import { AddInviteForm } from './add-invite-form'
import { RevokeInviteButton } from './revoke-invite-button'
import { CopyInviteButton } from './copy-invite-button'

const PATH = '/admin/invites'
const ROW_ID_PREFIX = 'invite'

// The page's own URL with some of its params changed: a tab or search starts its list from the top.
function hrefWith(searchParams: SearchParams, changes: Record<string, string | null>): string {
  const query = new URLSearchParams()
  for (const key of ['q', 'show']) {
    const value = key in changes ? changes[key] : searchParams[key]
    if (typeof value === 'string' && value !== '') query.set(key, value)
  }
  const search = query.toString()
  return search ? `${PATH}?${search}` : PATH
}

export default async function AdminInvitesPage(props: PageProps<'/admin/invites'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!atLeast(await getRole(supabase), 'admin')) redirect('/admin/tasks')

  const query = readSearchQuery(searchParams.q)
  // Claimed invites pile up past a thousand; the ones still waiting get the default tab (#254).
  const claimed = searchParams.show === 'claimed'
  const [list, counts] = await Promise.all([
    listInvitesPage(supabase, { query, claimed, page: readInvitePageParams(searchParams, 'before') }),
    countInvites(supabase, query),
  ])
  const backToNewestHref = newestHref(PATH, searchParams, 'before')

  return (
    <ContentReveal>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
        <SectionCard title="Invite someone" titleId="invite-someone">
          <AddInviteForm />
        </SectionCard>
        <SectionCard title="Invites" titleId="invites" action={<span className="text-sm text-ink2">New</span>} className="gap-1">
          <div className="flex flex-col gap-3 pt-2 pb-1">
            <SearchField action={PATH} label="Search invites" placeholder="Email" value={query} keep={claimed ? { show: 'claimed' } : {}} />
            <SubNav
              label="Show invites"
              items={[
                { href: hrefWith(searchParams, { show: null }), label: `Waiting (${counts.waiting.toLocaleString('en-US')})`, current: !claimed },
                { href: hrefWith(searchParams, { show: 'claimed' }), label: `Claimed (${counts.claimed.toLocaleString('en-US')})`, current: claimed },
              ]}
            />
            {query && (
              <SearchSummary
                count={claimed ? counts.claimed : counts.waiting}
                noun={['invite', 'invites']}
                query={query}
                clearHref={hrefWith(searchParams, { q: null })}
              />
            )}
          </div>
          <ShowMoreFocus />
          {list.windowed && list.rows.length > 0 && (
            <div className="flex flex-col border-b border-line py-3.5">
              <BackToNewest href={backToNewestHref} />
            </div>
          )}
          {list.rows.length === 0 ? (
            <div className="pt-2">
              {list.windowed ? (
                <NothingOlder href={backToNewestHref} />
              ) : query ? (
                <EmptyState icon={Mail} title={`No ${claimed ? 'claimed' : 'waiting'} invites match “${query}”.`} />
              ) : claimed ? (
                <EmptyState icon={Mail} title="No claimed invites yet.">
                  An invite moves here once its member signs in.
                </EmptyState>
              ) : (
                <EmptyState icon={Mail} title="No invites waiting.">
                  Add an email to invite someone.
                </EmptyState>
              )}
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {list.rows.map((invite) => (
                <InviteListItem
                  key={invite.email}
                  invite={invite}
                  domId={rowDomId(ROW_ID_PREFIX, invite.email)}
                  actions={
                    <>
                      <CopyInviteButton email={invite.email} />
                      <RevokeInviteButton email={invite.email} />
                    </>
                  }
                />
              ))}
            </ul>
          )}
          {list.next && (
            <div className="flex flex-col border-t border-line pt-3.5">
              <ShowMore
                href={showMoreHref(PATH, searchParams, 'before', list.next)}
                fresh={list.next.kind === 'window'}
                focusId={rowDomId(ROW_ID_PREFIX, list.next.firstId)}
              />
            </div>
          )}
        </SectionCard>
      </div>
    </ContentReveal>
  )
}
