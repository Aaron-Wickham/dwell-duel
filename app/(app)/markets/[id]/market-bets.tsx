import { requireUser } from '@/lib/auth/require-user'
import { getMarketBets, type MarketDetail } from '@/lib/markets/get-market'
import { newestHref, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { ContentReveal } from '@/components/nav/page-transition'
import { BetList } from '@/components/markets/bet-list'
import { NothingOlder } from '@/components/ui/nothing-older'
import { SectionCard } from '@/components/ui/section-card'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'

export const BET_ROW_ID_PREFIX = 'bet'

// Exported so the page-level paging tests (windowed-empty, focusId) can render this section
// directly: it's an async Server Component inside a <Suspense>, which jsdom can't render in place.
export async function MarketBets({
  market,
  viewerId,
  canBet,
  page,
  searchParams,
}: {
  market: MarketDetail
  viewerId: string
  canBet: boolean
  page: PageParams
  searchParams: SearchParams
}) {
  const { supabase } = await requireUser()
  const betsPage = await getMarketBets(supabase, market.id, page)
  const pathname = `/markets/${market.id}`
  const backToNewestHref = newestHref(pathname, searchParams, 'bets')

  return (
    <ContentReveal>
      <SectionCard title="Bets" titleId="bets-title" className="gap-1">
        <ShowMoreFocus />
        {betsPage.windowed && betsPage.rows.length > 0 && (
          <div className="flex flex-col py-2">
            <BackToNewest href={backToNewestHref} />
          </div>
        )}
        {betsPage.windowed && betsPage.rows.length === 0 ? (
          <NothingOlder href={backToNewestHref} />
        ) : (
          <BetList
            bets={betsPage.rows}
            outcomes={market.outcomes}
            viewerId={viewerId}
            canBet={canBet}
            rowIdPrefix={BET_ROW_ID_PREFIX}
          />
        )}
        {betsPage.next && (
          <div className="flex flex-col border-t border-line pt-3">
            <ShowMore
              href={showMoreHref(pathname, searchParams, 'bets', betsPage.next)}
              fresh={betsPage.next.kind === 'window'}
              focusId={rowDomId(BET_ROW_ID_PREFIX, betsPage.next.firstId)}
              description="Older bets"
            />
          </div>
        )}
      </SectionCard>
    </ContentReveal>
  )
}
