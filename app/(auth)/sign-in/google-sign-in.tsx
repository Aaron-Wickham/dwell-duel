'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LeafLoader } from '@/components/brand/leaf-loader'
import { reportClientError } from '@/lib/observability/client'
import { safeNextPath } from '@/lib/auth/next-path'
import { SignInButton } from './sign-in-button'
import { SignInError } from './sign-in-error'

export const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
// Google's button, or the fallback, rather than a wait with no end.
const LOAD_TIMEOUT_MS = 10_000
// renderButton's own limits.
const MIN_WIDTH = 200
const MAX_WIDTH = 400

type GoogleId = {
  initialize: (config: Record<string, unknown>) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } }
  }
}

// Google's script being blocked or unreachable (a content blocker, a privacy browser, a bad network)
// is expected, and the fallback button covers it, so it isn't reported (#363). Everything else is.
class GoogleUnavailable extends Error {}

let loading: Promise<GoogleId> | null = null

function loadGoogleId(): Promise<GoogleId> {
  const loaded = window.google?.accounts?.id
  if (loaded) return Promise.resolve(loaded)
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const ready = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in script loaded without google.accounts.id')))
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.onload = ready
    script.onerror = () => reject(new GoogleUnavailable('Google sign-in script failed to load'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

async function fetchNonce(next: string | null, signal: AbortSignal): Promise<string> {
  const response = await fetch('/auth/google/nonce', {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ next }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Google sign-in nonce: ${response.status}`)
  const { nonce } = (await response.json()) as { nonce?: unknown }
  if (typeof nonce !== 'string') throw new Error('Google sign-in nonce: no nonce')
  return nonce
}

// Still waiting on Google's script is Google being unreachable; still waiting on our nonce is ours.
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => {
      const Timeout = window.google?.accounts?.id ? Error : GoogleUnavailable
      reject(new Timeout('Google sign-in timed out loading'))
    }, ms),
  )
}

function prefersDark(): boolean {
  const theme = document.documentElement.dataset.theme
  return theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Google's own button, in redirect mode (a popup can't work in the installed iPhone app). Google
// POSTs the ID token to /auth/google on our domain, so its account chooser names dwellduel.com.
// If Google's script can't load, the Supabase OAuth button takes its place.
export function GoogleSignIn({ clientId }: { clientId: string }) {
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get('next'))
  const failedBefore = searchParams.has('error')
  const slot = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false
    // A rerun (Strict Mode, a new `next`) aborts the older request, so its response can't land after
    // the newer one's and leave Google holding a hash of a nonce the cookie no longer has.
    const abort = new AbortController()
    Promise.race([Promise.all([loadGoogleId(), fetchNonce(next, abort.signal)]), timeout(LOAD_TIMEOUT_MS)])
      .then(([id, nonce]) => {
        const parent = slot.current
        if (cancelled || !parent) return
        id.initialize({
          client_id: clientId,
          ux_mode: 'redirect',
          login_uri: `${window.location.origin}/auth/google`,
          nonce,
          auto_select: false,
        })
        parent.replaceChildren()
        id.renderButton(parent, {
          type: 'standard',
          theme: prefersDark() ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'center',
          width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.floor(parent.parentElement?.clientWidth ?? 0))),
        })
        setState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (!(error instanceof GoogleUnavailable)) reportClientError(error)
        setState('failed')
      })
    return () => {
      cancelled = true
      abort.abort()
    }
  }, [clientId, next])

  if (state === 'failed') return <SignInButton />

  return (
    <div className="flex w-full flex-col gap-5">
      <SignInError />
      {/* Google's iframe is 40px; the slot keeps the row a full 44px tap height. */}
      <div className="flex min-h-11 w-full items-center justify-center">
        {state === 'loading' && (
          <span className="flex items-center gap-2 text-ink2">
            <LeafLoader />
            <span role="status">Loading Google sign-in…</span>
          </span>
        )}
        {/* Google's iframe is a light document. Under a dark page the browser paints an opaque
            white backdrop behind an iframe whose color scheme differs from its own, which showed as
            a white box around the button; a normal scheme here keeps the backdrop transparent (#354). */}
        <div
          ref={slot}
          data-testid="google-sign-in"
          className={state === 'loading' ? 'hidden' : 'flex w-full justify-center [color-scheme:normal]'}
        />
      </div>
      {failedBefore && <SignInButton alternative />}
    </div>
  )
}
