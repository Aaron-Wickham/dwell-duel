import type { Metadata } from 'next'
import { Card } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { TryAgainLink } from './try-again-link'

export const metadata: Metadata = { title: 'Offline', robots: { index: false } }

// public/sw.js serves this page in place of any navigation that can't reach the network, so
// it reads no data. "Try again" is a plain empty-href link, not a client button: it reloads
// whatever URL the member was opening, and it works even if this page's scripts never load
// (TryAgainLink adds the waiting state, and reloads by itself when the connection comes back).
// The same card as ErrorCard (ST-11, ST-12).
export default function OfflinePage() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-3 p-7 md:p-10">
        <h1 className={h2Class}>You’re offline</h1>
        <p className="text-ink2">This page loads by itself as soon as you’re back online.</p>
        <div className="mt-1 flex w-full">
          <TryAgainLink />
        </div>
      </Card>
    </main>
  )
}
