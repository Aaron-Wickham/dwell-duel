import { useState, type ComponentProps } from 'react'
import { EditMarketDialog as Dialog, editMenuLabel } from '@/app/(app)/markets/[id]/edit-market-dialog'

// On the page the dialog opens from the "More actions" menu (market-menu.tsx), which holds `open`.
// A plain button labelled like the menu item stands in for it.
export function EditMarketDialog(props: Omit<ComponentProps<typeof Dialog>, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {editMenuLabel(props.mode)}
      </button>
      <Dialog {...props} open={open} onOpenChange={setOpen} />
    </>
  )
}
