'use client'

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { keepCheckedOnReset } from '@/lib/forms/keep-on-reset'
import {
  deletePushSubscriptionAction,
  saveNotificationPrefsAction,
  savePushSubscriptionAction,
  type PrefsState,
} from '@/lib/push/actions'
import { keyBytes, sameKey, writePushMemory } from '@/lib/push/client'
import type { NotificationKind, NotificationPrefs } from '@/lib/push/prefs'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { labelClass } from '@/components/ui/page'

type Support = 'supported' | 'unsupported' | 'ios-install'
type Device = 'checking' | 'off' | 'on' | 'denied'

const KINDS: { kind: NotificationKind; label: string; hint: string }[] = [
  { kind: 'resolve_reminders', label: 'Markets to resolve', hint: 'When a market you made has closed and is waiting on you. Admins hear about every market that closes with no result.' },
  { kind: 'results', label: 'Results', hint: 'When a market you bet on is resolved, changed or called off.' },
  { kind: 'task_reviews', label: 'Task reviews', hint: 'When your task is approved or rejected.' },
  { kind: 'new_markets', label: 'New markets', hint: 'When someone else creates a market.' },
]

// Only offered to reviewers and above, who are the only people it's ever sent to.
const REVIEWER_KIND = {
  kind: 'review_alerts',
  label: 'Tasks to review',
  hint: 'When a member submits a task waiting on you.',
} as const satisfies { kind: NotificationKind; label: string; hint: string }

const TURN_ON_FAILED = 'Couldn’t turn on notifications. Check your connection and try again.'
const TURN_OFF_FAILED = 'Couldn’t turn off notifications. Check your connection and try again.'

// Support never changes without a reload; the external store only reads it without a hydration
// mismatch, as InstallApp does.
const subscribe = () => () => {}

// iPhones and iPads only offer web push to an app added to the Home Screen (iOS 16.4 and later),
// so Safari in a tab has no PushManager at all. iPadOS reports itself as a Mac.
function detectSupport(): Support {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'supported'
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return ios && !window.matchMedia('(display-mode: standalone)').matches ? 'ios-install' : 'unsupported'
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

// The worker registers on every page load in production, but not in dev; don't wait forever.
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No service worker')), 10_000)),
  ])
}

function DeviceStatus({
  userId,
  publicKey,
  endpoints,
  device,
  setDevice,
}: {
  userId: string
  publicKey: string
  endpoints: string[]
  // Held by NotificationSettings, which disables the choices while this device is blocked.
  device: Device
  setDevice: (device: Device) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Turning on swaps the button for its opposite, so focus follows to the new one; the buttons
  // stay enabled while busy (aria-disabled plus a guard), or focus would be lost a second time.
  const button = useRef<HTMLButtonElement>(null)
  const flipped = useRef(false)

  useEffect(() => {
    if (!flipped.current) return
    flipped.current = false
    button.current?.focus()
  }, [device])

  useEffect(() => {
    let live = true
    ;(async () => {
      let next: Device = 'off'
      if (Notification.permission === 'denied') next = 'denied'
      else {
        const subscription = await currentSubscription().catch(() => null)
        if (subscription && Notification.permission === 'granted' && endpoints.includes(subscription.endpoint)) {
          next = 'on'
          // A device that was on before re-sync shipped has no memory yet; this gives it one.
          writePushMemory(localStorage, userId, { endpoint: subscription.endpoint, syncedAt: Date.now() })
        }
      }
      if (live) setDevice(next)
    })()
    return () => {
      live = false
    }
  }, [endpoints, userId, setDevice])

  async function turnOn() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setDevice(permission === 'denied' ? 'denied' : 'off')
        if (permission === 'default') setError('Choose Allow when your browser asks, to get notifications.')
        return
      }
      const registration = await readyRegistration()
      const key = keyBytes(publicKey)
      let subscription = await registration.pushManager.getSubscription()
      // A subscription made with an older key can't receive this server's pushes.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe()
        subscription = null
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      const { endpoint, keys } = subscription.toJSON()
      const result = await savePushSubscriptionAction({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth })
      if (result.error) {
        setError(result.error)
        return
      }
      writePushMemory(localStorage, userId, { endpoint: subscription.endpoint, syncedAt: Date.now() })
      flipped.current = true
      setDevice('on')
    } catch {
      setError(TURN_ON_FAILED)
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const subscription = await currentSubscription()
      if (subscription) {
        const result = await deletePushSubscriptionAction(subscription.endpoint)
        if (result.error) {
          setError(result.error)
          return
        }
        await subscription.unsubscribe()
      }
      writePushMemory(localStorage, userId, null)
      flipped.current = true
      setDevice('off')
    } catch {
      setError(TURN_OFF_FAILED)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {device === 'checking' && <p className="text-ink2">Checking this device…</p>}
      {device === 'denied' && (
        <Message tone="gold">
          Notifications are blocked for DwellDuel on this device. Allow them for this site in your browser or phone settings,
          then reload this page.
        </Message>
      )}
      {device === 'off' && (
        <>
          <p className="text-ink2">Notifications are off on this device.</p>
          <Button ref={button} variant="secondary" size="sm" onClick={turnOn} aria-disabled={busy || undefined}>
            Turn on notifications
          </Button>
        </>
      )}
      {device === 'on' && (
        <>
          <p className="text-ink2">Notifications are on for this device.</p>
          <Button ref={button} variant="secondary" size="sm" onClick={turnOff} aria-disabled={busy || undefined}>
            Turn off on this device
          </Button>
        </>
      )}
      {error && <Message tone="error">{error}</Message>}
    </div>
  )
}

function PrefsForm({
  prefs,
  reviewer,
  unavailable,
}: {
  prefs: NotificationPrefs
  reviewer: boolean
  // Why the choices can't be changed here, when they can't (#398).
  unavailable: string | null
}) {
  const [values, setValues] = useState(prefs)
  const [state, formAction] = useActionState<PrefsState, FormData>(
    withSuccessToast(saveNotificationPrefsAction, (s) => Boolean(s?.formError), 'Notification choices saved.'),
    undefined,
  )
  const errorId = 'notification-prefs-error'
  const reasonId = 'notification-prefs-unavailable'

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <fieldset
        className="flex flex-col gap-3"
        disabled={unavailable !== null}
        aria-describedby={[unavailable ? reasonId : null, state?.formError ? errorId : null].filter(Boolean).join(' ') || undefined}
      >
        <legend className={`mb-1.5 ${labelClass}`}>Notify me about</legend>
        {unavailable && (
          <p id={reasonId} className="text-sm text-ink2">
            {unavailable}
          </p>
        )}
        {(reviewer ? [...KINDS, REVIEWER_KIND] : KINDS).map(({ kind, label, hint }) => (
          <div key={kind} className="flex flex-col gap-0.5">
            <label className="pressable inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold has-disabled:cursor-default has-disabled:text-ink2">
              <input
                type="checkbox"
                name={kind}
                checked={values[kind]}
                ref={keepCheckedOnReset(values[kind])}
                onChange={(e) => setValues((v) => ({ ...v, [kind]: e.target.checked }))}
                aria-describedby={`notify-${kind}-hint`}
                className="m-0 size-[22px] accent-primary"
              />
              {label}
            </label>
            <p id={`notify-${kind}-hint`} className="pl-8 text-sm text-ink2">
              {hint}
            </p>
          </div>
        ))}
      </fieldset>
      {/* Not offered to a member, but a save mustn't switch it off for when they become a reviewer. */}
      {!reviewer && <input type="hidden" name="review_alerts" value={values.review_alerts ? 'on' : ''} />}
      {!unavailable && <p className="text-sm text-ink2">These choices follow your account, on every device where notifications are on.</p>}
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
      <FormSubmitButton variant="secondary" size="sm" className="self-start" disabled={unavailable !== null}>
        Save choices
      </FormSubmitButton>
    </form>
  )
}

export function NotificationSettings({
  userId,
  publicKey,
  endpoints,
  prefs,
  reviewer,
}: {
  userId: string
  publicKey: string | null
  endpoints: string[]
  prefs: NotificationPrefs
  reviewer: boolean
}) {
  const support = useSyncExternalStore(subscribe, detectSupport, () => null)
  const [device, setDevice] = useState<Device>('checking')
  // Unknown until the browser answers, so the choices don't flash disabled on every load.
  const unavailable =
    !publicKey || support === 'unsupported'
      ? 'You can choose these on a device that can get notifications.'
      : support === 'ios-install'
        ? 'You can choose these once DwellDuel is on your Home Screen.'
        : support === 'supported' && device === 'denied'
          ? 'You can choose these once notifications are allowed.'
          : null

  return (
    <div className="flex flex-col gap-5">
      {!publicKey ? (
        <p className="text-ink2">Notifications aren’t available here: this copy of DwellDuel isn’t set up to send them.</p>
      ) : support === 'ios-install' ? (
        <p className="text-ink2">
          On iPhone and iPad, notifications need DwellDuel on your Home Screen (iOS 16.4 or later). Tap Share, then Add to
          Home Screen, open DwellDuel from there and turn them on here.
        </p>
      ) : support === 'unsupported' ? (
        <p className="text-ink2">This browser can’t show notifications from DwellDuel.</p>
      ) : support === 'supported' ? (
        <DeviceStatus userId={userId} publicKey={publicKey} endpoints={endpoints} device={device} setDevice={setDevice} />
      ) : null}
      <PrefsForm prefs={prefs} reviewer={reviewer} unavailable={unavailable} />
    </div>
  )
}
