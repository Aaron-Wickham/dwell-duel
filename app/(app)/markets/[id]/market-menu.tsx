'use client'

import { useRef, useState, type ReactNode, type RefObject } from 'react'
import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import { Dialog } from '@base-ui/react/dialog'
import { CalendarClock, CopyPlus, History, MoreHorizontal, Pencil, Share2, type LucideIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { dialogBackdropClass, dialogPopupClass } from '@/components/ui/dialog-classes'
import { LocalTime } from '@/components/ui/local-time'
import { h2Class, uiTextClass } from '@/components/ui/page'
import type { MarketEdit } from '@/lib/markets/market-edits'
import { cn } from '@/lib/utils'
import { EditMarketDialog, editMenuLabel, type EditMarketMode } from './edit-market-dialog'
import { ManualShareLink, useMarketShare } from './market-share'

const itemClass = `pressable flex min-h-11 items-center gap-3 rounded-segment px-3 ${uiTextClass} font-bold text-ink no-underline outline-none select-none data-highlighted:bg-sunk`

function ItemContent({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon aria-hidden="true" className="size-5 shrink-0 text-ink2" />
      {children}
    </>
  )
}

// What the edit dialog needs, when the viewer may edit at all (update_market, 0103, 0106).
export interface MarketEditOptions {
  description: string | null
  category: string
  closeAt: string
  // `edit` while the market takes bets; `category` for an admin once it has closed.
  mode: Extract<EditMarketMode, 'edit' | 'category'> | null
  canMoveClose: boolean
  canReopen: boolean
  suggestions: string[]
  popular: string[]
}

type OpenDialog = EditMarketMode | 'history' | null

// The market's secondary actions behind one button (#390), the same Base UI Menu as the avatar's:
// Share, Duplicate, Edit or Reopen when allowed, and the edit history when there is one. Each
// dialog opens from the menu and hands focus back to its button when it closes.
export function MarketMenu({
  marketId,
  title,
  edit,
  edits,
}: {
  marketId: string
  title: string
  edit: MarketEditOptions
  edits: MarketEdit[]
}) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const { share, manualUrl } = useMarketShare(marketId, title)
  const marketProps = { marketId, title, description: edit.description, category: edit.category, closeAt: edit.closeAt }
  const toggle = (mode: OpenDialog) => (open: boolean) => setDialog(open ? mode : null)

  return (
    <>
      <Menu.Root modal={false}>
        <Menu.Trigger
          ref={trigger}
          aria-label="More actions"
          className="pressable inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
        >
          <MoreHorizontal aria-hidden="true" className="size-6" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-40 outline-none">
            <Menu.Popup className="flex min-w-56 origin-(--transform-origin) flex-col gap-0.5 rounded-tile border border-line bg-surface p-1.5 text-ink shadow-overlay outline-none transition-[opacity,scale] duration-(--duration-fast) data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none">
              <Menu.Item className={itemClass} onClick={() => void share()}>
                <ItemContent icon={Share2}>Share</ItemContent>
              </Menu.Item>
              {/* Every member can create markets, so anyone can start a copy; nothing exists until it's submitted. */}
              <Menu.LinkItem
                closeOnClick
                className={itemClass}
                render={<Link href={`/markets/new?from=${marketId}`} transitionTypes={['nav-forward']} />}
              >
                <ItemContent icon={CopyPlus}>Duplicate</ItemContent>
              </Menu.LinkItem>
              {edit.mode && (
                <Menu.Item className={itemClass} onClick={() => setDialog(edit.mode)}>
                  <ItemContent icon={Pencil}>{editMenuLabel(edit.mode)}</ItemContent>
                </Menu.Item>
              )}
              {edit.canReopen && (
                <Menu.Item className={itemClass} onClick={() => setDialog('reopen')}>
                  <ItemContent icon={CalendarClock}>{editMenuLabel('reopen')}</ItemContent>
                </Menu.Item>
              )}
              {edits.length > 0 && (
                <Menu.Item className={itemClass} onClick={() => setDialog('history')}>
                  <ItemContent icon={History}>Edit history</ItemContent>
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {manualUrl && <ManualShareLink url={manualUrl} />}
      {edit.mode && (
        <EditMarketDialog
          {...marketProps}
          mode={edit.mode}
          canMoveClose={edit.canMoveClose}
          suggestions={edit.suggestions}
          popular={edit.popular}
          open={dialog === edit.mode}
          onOpenChange={toggle(edit.mode)}
          finalFocus={trigger}
        />
      )}
      {edit.canReopen && (
        <EditMarketDialog
          {...marketProps}
          mode="reopen"
          suggestions={[]}
          popular={[]}
          open={dialog === 'reopen'}
          onOpenChange={toggle('reopen')}
          finalFocus={trigger}
        />
      )}
      {edits.length > 0 && (
        <EditHistoryDialog edits={edits} open={dialog === 'history'} onOpenChange={toggle('history')} finalFocus={trigger} />
      )}
    </>
  )
}

// Every past version, newest first (0043): a market reworded after people bet on it, or a close
// time moved, stays on the record.
function EditHistoryDialog({
  edits,
  open,
  onOpenChange,
  finalFocus,
}: {
  edits: MarketEdit[]
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus: RefObject<HTMLButtonElement | null>
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} />
        <Dialog.Popup finalFocus={finalFocus} className={cn(dialogPopupClass, 'max-w-[560px]')}>
          <Dialog.Title className={h2Class}>Edit history</Dialog.Title>
          <ol className="flex flex-col gap-3 text-sm text-ink2">
            {edits.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
                <span>
                  {e.editorName}, <LocalTime iso={e.editedAt} format="dateTime" />
                </span>
                {e.oldTitle !== e.newTitle && (
                  <span className="break-words">
                    Title was: <span className="text-ink">“{e.oldTitle}”</span>
                  </span>
                )}
                {e.oldCategory !== null && (
                  <span className="break-words">
                    Category was: <span className="text-ink">{e.oldCategory}</span>
                  </span>
                )}
                {e.oldCloseAt !== null && e.newCloseAt !== null && (
                  <span>
                    Close time moved from{' '}
                    <span className="text-ink">
                      <LocalTime iso={e.oldCloseAt} format="dateTime" />
                    </span>{' '}
                    to{' '}
                    <span className="text-ink">
                      <LocalTime iso={e.newCloseAt} format="dateTime" />
                    </span>
                  </span>
                )}
                {e.oldDescription !== e.newDescription && (
                  <span className="whitespace-pre-line break-words">
                    Description was: <span className="text-ink">{e.oldDescription ? `“${e.oldDescription}”` : '(none)'}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <Dialog.Close className={cn(buttonVariants({ variant: 'secondary' }), 'md:self-end')}>Close</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
