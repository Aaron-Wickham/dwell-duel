import type { Metadata } from 'next'
import { WifiOff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { h1Class } from '@/components/ui/page'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Offline', robots: { index: false } }

// public/sw.js serves this page in place of any navigation that can't reach the network, so
// it reads no data. "Try again" is a plain empty-href link, not a client button: it reloads
// whatever URL the member was opening, and it works even if this page's scripts never load.
export default function OfflinePage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-4 p-7 md:p-10">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
          <WifiOff className="size-6" />
        </span>
        <h1 className={h1Class}>You’re offline</h1>
        <p className="text-ink2">DwellDuel needs a connection for this page. It’ll load as soon as you’re back online.</p>
        <a href="" className={cn(buttonVariants({ variant: 'primary', block: true }), 'md:w-auto')}>
          Try again
        </a>
      </Card>
    </div>
  )
}
