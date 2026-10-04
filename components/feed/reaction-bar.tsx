'use client'

import { startTransition, useOptimistic } from 'react'
import { toast } from 'sonner'
import { haptics } from '@/lib/haptics'
import { REACTIONS, reactionLabel, toggleReaction, type EventReactions, type ReactionKind } from '@/lib/social/reactions'
import { setReactionAction } from '@/lib/social/reactions-actions'
import { cn } from '@/lib/utils'
import { uiTextClass } from '@/components/ui/page'

// Reactions are optimistic: they move no coins, so the tap shows at once and gives way to the
// server's counts when the action's refresh lands. A refused toggle falls back on its own, since
// the prop it reverts to never changed.
export function ReactionBar({ eventId, reactions }: { eventId: string; reactions: EventReactions }) {
  const [shown, apply] = useOptimistic(reactions, (current, change: { kind: ReactionKind; on: boolean }) =>
    toggleReaction(current, change.kind, change.on),
  )

  function toggle(kind: ReactionKind) {
    const on = !shown[kind].mine
    haptics.tap()
    startTransition(async () => {
      apply({ kind, on })
      const result = await setReactionAction(eventId, kind, on)
      if (result.error) {
        toast.error(result.error)
        haptics.error()
      }
    })
  }

  return (
    <div role="group" aria-label="Reactions" className="flex flex-wrap gap-2">
      {REACTIONS.map(({ kind, emoji, name }) => {
        const count = shown[kind]
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={count.mine}
            aria-label={reactionLabel(name, count)}
            onClick={() => toggle(kind)}
            className={cn(
              `pressable inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-full border-[1.5px] px-2.5 ${uiTextClass} font-bold tabular-nums`,
              count.mine ? 'border-acc-text bg-acc-soft text-acc-text' : 'border-line bg-surface text-ink2',
            )}
          >
            <span aria-hidden="true">{emoji}</span>
            {count.count > 0 && <span aria-hidden="true">{count.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
