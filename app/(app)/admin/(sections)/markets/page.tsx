import { redirect } from 'next/navigation'
import { Gavel } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { listAwaitingMarkets } from '@/lib/admin/markets-awaiting'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { listCardsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { ContentReveal } from '@/components/nav/page-transition'
import { AwaitingMarketRow } from '@/components/admin/awaiting-market-row'
import { CategoryCard } from '@/components/admin/category-card'
import { listCategoryCounts, OTHER_CATEGORY_ID } from '@/lib/markets/categories'

const ROW_ID_PREFIX = 'awaiting'

// The markets share of the Admin badge (#243): every market past its close with no result, which
// only admins are counted, since only they can resolve one they hold a stake in.
export default async function AdminMarketsPage(props: PageProps<'/admin/markets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  if (!atLeast(role, 'admin')) redirect('/admin/tasks')

  // A Server Component renders once per request, so the purity rule's re-render worry doesn't apply.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const [markets, counts] = await Promise.all([
    listAwaitingMarkets(supabase, readPageParams(searchParams, 'after'), new Date(now).toISOString()),
    listCategoryCounts(supabase, true),
  ])
  // Busiest first, as on Markets, with the hidden ones after.
  const categories = [...counts.filter((c) => c.hiddenAt === null), ...counts.filter((c) => c.hiddenAt !== null)]
  const visible = categories.filter((c) => c.hiddenAt === null)
  const backToNewestHref = newestHref('/admin/markets', searchParams, 'after')

  return (
    <ContentReveal>
      <div className="flex flex-col gap-5 md:gap-7">
        <SectionCard
          title="Waiting to be resolved"
          titleId="awaiting-title"
          description="Closed with no result yet, oldest first. Bets and parlays wait on these."
        >
          <ShowMoreFocus />
          {markets.windowed && markets.rows.length > 0 && <BackToNewest href={backToNewestHref} />}
          {markets.rows.length === 0 ? (
            markets.windowed ? (
              <NothingOlder href={backToNewestHref} />
            ) : (
              <EmptyState icon={Gavel} title="Nothing to resolve.">
                A market shows up here once it closes, until someone resolves it.
              </EmptyState>
            )
          ) : (
            <ul className={cn(listCardsClass, 'lg:grid lg:grid-cols-3 lg:items-start lg:gap-4')}>
              {markets.rows.map((m) => (
                <AwaitingMarketRow key={m.id} market={m} now={now} domId={rowDomId(ROW_ID_PREFIX, m.id)} />
              ))}
            </ul>
          )}
          {markets.next && (
            <ShowMore
              href={showMoreHref('/admin/markets', searchParams, 'after', markets.next)}
              fresh={markets.next.kind === 'window'}
              focusId={rowDomId(ROW_ID_PREFIX, markets.next.firstId)}
            />
          )}
        </SectionCard>
        <SectionCard
          title="Categories"
          titleId="categories-title"
          description="Members make these when they create a market. Rename a misspelt one, merge two that mean the same, or hide one nobody should pick."
        >
          <ul className={cn(listCardsClass, 'lg:grid lg:grid-cols-3 lg:items-start lg:gap-4')}>
            {categories.map((c) => (
              <CategoryCard key={c.id} category={c} fixed={c.id === OTHER_CATEGORY_ID} targets={visible.filter((t) => t.id !== c.id)} />
            ))}
          </ul>
        </SectionCard>
      </div>
    </ContentReveal>
  )
}
