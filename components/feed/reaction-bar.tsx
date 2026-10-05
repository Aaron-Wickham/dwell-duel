'use client'

import { startTransition, useOptimistic, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { SmilePlus } from 'lucide-react'
import { toast } from 'sonner'
import { haptics } from '@/lib/haptics'
import { REACTIONS, reactionLabel, toggleReaction, type EventReactions, type ReactionKind } from '@/lib/social/reactions'
import { setReactionAction } from '@/lib/social/reactions-actions'
import { cn } from '@/lib/utils'

// The button is the 44px target; the pill drawn inside it stays compact, so a row with reactions
// doesn't grow by a full button height.
const pillButtonClass = 'pressable group inline-flex min-h-11 cursor-pointer items-center'
const pillClass = 'inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-sm font-bold'

// --line-s, not --line: the edge is all that marks an unselected pill as a control (A11Y-07).
function pillTone(mine: boolean) {
  return mine ? 'border-acc-text bg-acc-soft text-acc-text' : 'border-line-s bg-surface text-ink2'
}

// Reactions on demand (#395): only the reactions someone has used show, as pills, plus one React
// button that opens all four. Four empty buttons under every row drowned the sentences (CR-B03).
// It renders two items of FeedItem's grid that share one optimistic state: the pills under the
// sentence, only when there are any, and React under the age, so a row nobody reacted to is its
// sentence and age alone.
// Reactions are optimistic: they move no coins, so the tap shows at once and gives way to the
// server's counts when the action's refresh lands. A refused toggle falls back on its own, since
// the prop it reverts to never changed.
export function ReactionBar({ eventId, reactions }: { eventId: string; reactions: EventReactions }) {
  const [shown, apply] = useOptimistic(reactions, (current, change: { kind: ReactionKind; on: boolean }) =>
    toggleReaction(current, change.kind, change.on),
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function toggle(kind: ReactionKind) {
    const on = !shown[kind].mine
    // Taking back the last reaction of a kind removes its pill, the button that has focus, so focus
    // moves to React rather than falling back to the page.
    if (!on && shown[kind].count === 1) triggerRef.current?.focus()
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

  const used = REACTIONS.filter(({ kind }) => shown[kind].count > 0)

  return (
    <>
      {used.length > 0 && (
        <div role="group" aria-label="Reactions" className="col-start-1 row-start-3 flex flex-wrap items-center gap-x-1.5">
          {used.map(({ kind, emoji, name }) => {
            const count = shown[kind]
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={count.mine}
                aria-label={reactionLabel(name, count)}
                onClick={() => toggle(kind)}
                className={pillButtonClass}
              >
                <span aria-hidden="true" className={cn(pillClass, pillTone(count.mine))}>
                  <span>{emoji}</span>
                  <span>{count.count}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      <Popover.Root open={pickerOpen} onOpenChange={setPickerOpen} modal="trap-focus">
        {/* Its 44px box hangs into the row's right edge and bottom padding, so under the age it adds
            little to the row's height. */}
        <Popover.Trigger
          ref={triggerRef}
          aria-label="React"
          className="pressable col-start-2 row-start-2 -mt-2 -mr-3 -mb-3.5 inline-flex size-11 cursor-pointer items-center justify-center justify-self-end rounded-full text-ink2 hover:bg-sunk hover:text-ink"
        >
          <SmilePlus aria-hidden="true" className="size-5" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" align="end" sideOffset={6} className="z-40 outline-none">
            <Popover.Popup className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-overlay outline-none transition-[opacity,scale] duration-(--duration-fast) data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none">
              <Popover.Title className="sr-only">React</Popover.Title>
              {REACTIONS.map(({ kind, emoji, name }) => {
                const count = shown[kind]
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={count.mine}
                    aria-label={reactionLabel(name, count)}
                    onClick={() => {
                      setPickerOpen(false)
                      toggle(kind)
                    }}
                    className={cn(
                      'pressable inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-xl',
                      count.mine ? 'bg-acc-soft' : 'hover:bg-sunk',
                    )}
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                )
              })}
              <Popover.Close className="sr-only">Close</Popover.Close>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}
