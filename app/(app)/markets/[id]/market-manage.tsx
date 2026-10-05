import type { MarketDetail } from '@/lib/markets/get-market'
import { SectionCard } from '@/components/ui/section-card'
import { DeleteMarketButton } from './delete-market-button'
import { ResolveForm } from './resolve-form'
import { VoidForm } from './void-form'

// What the viewer may do to the market, read before anything streams (page.tsx), so the page
// knows where these cards go and holds no skeleton for cards that never come.
export interface ManageRights {
  // can_resolve_market (0046): after close, the creator or a reviewer with no stake; an admin at any time.
  canResolve: boolean
  // An admin may change the result of a resolved market.
  canOverride: boolean
  // can_void_market (0105): an admin at any time; the creator until close, with no stake (0104).
  canVoid: boolean
  // delete_market (0040): the owner, on a market nobody has bet on.
  canDelete: boolean
  hasStake: boolean
  admin: boolean
}

export function hasManageCards(rights: ManageRights): boolean {
  return rights.canResolve || rights.canOverride || rights.canVoid || rights.canDelete
}

// Resolve and Void are separate cards (#390), so two forms with two submit buttons never share
// one, and Void, which refunds everything, sits below and quieter. Each still confirms first.
export function MarketManage({ market, rights, canBet }: { market: MarketDetail; rights: ManageRights; canBet: boolean }) {
  const { canResolve, canOverride, canVoid, canDelete, hasStake, admin } = rights
  const showResolve = canResolve || canOverride

  // Only what the viewer couldn't already tell from the page: why they may resolve when it isn't obvious.
  const resolveHint = canOverride
    ? 'A new outcome reverses the payouts and pays the new winners.'
    : hasStake && admin
      ? 'You have a stake in this market, but as an admin you can still resolve it.'
      : canBet
        ? 'It hasn’t closed yet, but an admin can resolve it early.'
        : 'Pick the winner and say why. Winning solo bets are paid straight away.'

  return (
    <>
      {showResolve && (
        <SectionCard
          title={canOverride ? 'Override resolution' : 'Resolve market'}
          titleId="manage-title"
          description={resolveHint}
        >
          <ResolveForm
            marketId={market.id}
            outcomes={market.outcomes}
            line={market.kind === 'over_under' ? market.line : null}
            override={canOverride}
            currentOutcomeId={market.resolvedOutcomeId}
          />
        </SectionCard>
      )}
      {canVoid && (
        <SectionCard title="Void market" titleId="void-title">
          <VoidForm marketId={market.id} />
        </SectionCard>
      )}
      {canDelete && (
        <SectionCard title="Delete market" titleId="delete-title">
          <DeleteMarketButton marketId={market.id} />
        </SectionCard>
      )}
    </>
  )
}
