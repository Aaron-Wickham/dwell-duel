'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/field'

// Links always point at the www host, even when the app was opened on the bare domain. A
// subdomain (a Vercel preview) or localhost is left as it is.
export function marketShareUrl(origin: string, marketId: string): string {
  const url = new URL(`/markets/${marketId}`, origin)
  if (/^[^.]+\.[a-z]{2,}$/i.test(url.hostname)) url.hostname = `www.${url.hostname}`
  return url.href
}

// The textarea fallback, for browsers (or insecure origins) with no Clipboard API.
function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}

async function copy(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission refused, or no focus: the textarea may still work.
    }
  }
  return copyWithTextarea(text)
}

// Share sheet first, then the clipboard. `manualUrl` is set only when neither worked, so the
// member can copy the link by hand from ManualShareLink.
export function useMarketShare(marketId: string, title: string): { share: () => Promise<void>; manualUrl: string | null } {
  const [manualUrl, setManualUrl] = useState<string | null>(null)

  async function share() {
    const url = marketShareUrl(window.location.origin, marketId)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    if (await copy(url)) {
      setManualUrl(null)
      toast.success('Link copied')
    } else {
      setManualUrl(url)
    }
  }

  return { share, manualUrl }
}

export function ManualShareLink({ url }: { url: string }) {
  return (
    <div className="flex basis-full flex-col gap-1.5">
      <label htmlFor="market-share-url" className="text-sm text-ink2">
        Copy this link to share the market
      </label>
      <Input id="market-share-url" readOnly value={url} autoFocus onFocus={(e) => e.currentTarget.select()} />
    </div>
  )
}
