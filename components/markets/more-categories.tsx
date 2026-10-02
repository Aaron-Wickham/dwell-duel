'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@base-ui/react/dialog'
import { buttonVariants } from '@/components/ui/button'
import { dialogBackdropClass, dialogPopupClass } from '@/components/ui/dialog-classes'
import { filterChipClass, type FilterChip } from '@/components/ui/filter-chips'
import { h2Class } from '@/components/ui/page'
import { cn } from '@/lib/utils'

// The markets list's More… chip: every category, beyond the busiest the row shows. Choosing one
// closes the dialog as the list moves to it.
export function MoreCategories({ items }: { items: FilterChip[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={filterChipClass(false)}>More…</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogBackdropClass} />
        <Dialog.Popup className={cn(dialogPopupClass, 'max-w-[560px]')}>
          <div className="flex flex-col gap-2">
            <Dialog.Title className={h2Class}>All categories</Dialog.Title>
            <Dialog.Description className="text-ink2">Busiest first: the most markets still taking bets.</Dialog.Description>
          </div>
          <nav aria-label="All categories" className="no-callout flex flex-wrap gap-2">
            {items.map(({ href, label, current }) => (
              <Link
                key={href}
                href={href}
                aria-current={current ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={filterChipClass(current)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex md:justify-end">
            <Dialog.Close className={cn(buttonVariants({ variant: 'secondary' }), 'w-full md:w-auto')}>Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
