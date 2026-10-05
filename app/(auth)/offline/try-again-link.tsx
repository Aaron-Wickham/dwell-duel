'use client'

import { useEffect, useState } from 'react'
import { LeafLoader } from '@/components/brand/leaf-loader'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Still a plain empty-href link, so it reloads the URL the member was opening even if this script
// never loads. With it, the link shows it's working while the reload waits on the network, and the
// page reloads by itself when the browser says the connection is back (ST-12).
export function TryAgainLink() {
  const [trying, setTrying] = useState(false)
  useEffect(() => {
    function onOnline() {
      setTrying(true)
      location.reload()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return (
    <a
      href=""
      onClick={() => setTrying(true)}
      className={cn(buttonVariants({ variant: 'primary', block: true }), 'md:w-auto')}
    >
      {trying ? (
        <>
          <LeafLoader />
          <span role="status">Trying again…</span>
        </>
      ) : (
        'Try again'
      )}
    </a>
  )
}
