'use client'

import { useState } from 'react'
import { Message } from '@/components/ui/message'
import { setThemeAction } from '@/lib/theme/set-theme'
import type { ThemeChoice } from '@/lib/theme/theme'
import { setHapticsAction, setReduceMotionAction } from '@/lib/preferences/set-preference'
import { useDeviceReducesMotion } from '@/lib/ui/reduced-motion'
import { cn } from '@/lib/utils'
import { labelClass } from '@/components/ui/page'

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const SAVE_FAILED = 'Couldn’t save that setting. Check your connection and try again.'

// Each control applies its choice to <html> straight away, then saves the cookie; a failed save
// puts both back, so what you see is always what the next page load will use.
function useSaved<T>(initial: T, apply: (value: T) => void, save: (value: T) => Promise<void>) {
  const [value, setValue] = useState(initial)
  const [failed, setFailed] = useState(false)
  function change(next: T) {
    const previous = value
    setValue(next)
    setFailed(false)
    apply(next)
    save(next).catch(() => {
      setValue(previous)
      apply(previous)
      setFailed(true)
    })
  }
  return [value, change, failed] as const
}

function setDataset(key: 'theme' | 'haptics' | 'motion', value: string | null) {
  if (value === null) delete document.documentElement.dataset[key]
  else document.documentElement.dataset[key] = value
}

export function ThemeSetting({ initial }: { initial: ThemeChoice }) {
  const [theme, change, failed] = useSaved<ThemeChoice>(
    initial,
    (t) => setDataset('theme', t === 'system' ? null : t),
    setThemeAction,
  )
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={`mb-1.5 ${labelClass}`}>Theme</legend>
      <div className="grid grid-cols-3 gap-1.5 rounded-[14px] bg-sunk p-1">
        {THEMES.map(({ value, label }) => (
          <label
            key={value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] font-bold text-ink2',
              theme === value && 'bg-surface text-ink shadow-tab',
            )}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => change(value)}
              className="size-[18px] accent-primary"
            />
            {label}
          </label>
        ))}
      </div>
      {theme === 'system' && <p className="text-sm text-ink2">Follows your device’s light or dark setting.</p>}
      {failed && <Message tone="error">{SAVE_FAILED}</Message>}
    </fieldset>
  )
}

function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="pressable inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold has-disabled:cursor-default">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={`${id}-hint`}
          className="m-0 size-[22px] accent-primary"
        />
        {label}
      </label>
      <p id={`${id}-hint`} className="pl-8 text-sm text-ink2">
        {hint}
      </p>
    </div>
  )
}

export function MotionSettings({ haptics, reduceMotion }: { haptics: boolean; reduceMotion: boolean }) {
  const [vibrate, changeVibrate, vibrateFailed] = useSaved(
    haptics,
    (on) => setDataset('haptics', on ? null : 'off'),
    setHapticsAction,
  )
  const [reduce, changeReduce, reduceFailed] = useSaved(
    reduceMotion,
    (on) => setDataset('motion', on ? 'reduce' : null),
    setReduceMotionAction,
  )
  const deviceReduces = useDeviceReducesMotion()

  return (
    <div className="flex flex-col gap-3">
      <Toggle
        id="setting-haptics"
        label="Vibrate on taps"
        hint="A light buzz when you tap a tab or a bet goes through. Android only: iPhones don’t let web apps vibrate."
        checked={vibrate}
        onChange={changeVibrate}
      />
      <Toggle
        id="setting-motion"
        label="Reduce animations"
        hint={
          deviceReduces
            ? 'Your device is set to reduce motion, so animations are already off.'
            : 'Turns off page transitions and rolling numbers.'
        }
        checked={reduce || deviceReduces}
        disabled={deviceReduces}
        onChange={changeReduce}
      />
      {(vibrateFailed || reduceFailed) && <Message tone="error">{SAVE_FAILED}</Message>}
    </div>
  )
}
