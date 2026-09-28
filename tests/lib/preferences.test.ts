import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HAPTICS_COOKIE, MOTION_COOKIE, preferenceAttributes, resolvePreferences } from '@/lib/preferences/preferences'

const jar = { set: vi.fn(), delete: vi.fn() }
vi.mock('next/headers', () => ({ cookies: async () => jar }))

import { setHapticsAction, setReduceMotionAction } from '@/lib/preferences/set-preference'
import { setThemeAction } from '@/lib/theme/set-theme'

beforeEach(() => {
  jar.set.mockClear()
  jar.delete.mockClear()
})

describe('resolvePreferences', () => {
  it('defaults to haptics on and motion following the device', () => {
    expect(resolvePreferences(() => undefined)).toEqual({ haptics: true, reduceMotion: false })
  })

  it('reads only the exact saved values', () => {
    const cookies: Record<string, string> = { [HAPTICS_COOKIE]: 'off', [MOTION_COOKIE]: 'reduce' }
    expect(resolvePreferences((name) => cookies[name])).toEqual({ haptics: false, reduceMotion: true })
    expect(resolvePreferences(() => 'yes')).toEqual({ haptics: true, reduceMotion: false })
  })
})

describe('preferenceAttributes', () => {
  it('adds an attribute only for a non-default choice', () => {
    expect(preferenceAttributes({ haptics: true, reduceMotion: false })).toEqual({})
    expect(preferenceAttributes({ haptics: false, reduceMotion: true })).toEqual({ 'data-haptics': 'off', 'data-motion': 'reduce' })
  })
})

describe('the preference actions', () => {
  it('saves haptics off, and forgets the cookie when turned back on', async () => {
    await setHapticsAction(false)
    expect(jar.set).toHaveBeenCalledWith(HAPTICS_COOKIE, 'off', expect.objectContaining({ path: '/', httpOnly: true }))
    await setHapticsAction(true)
    expect(jar.delete).toHaveBeenCalledWith(HAPTICS_COOKIE)
  })

  it('saves reduced motion, and forgets the cookie when turned off', async () => {
    await setReduceMotionAction(true)
    expect(jar.set).toHaveBeenCalledWith(MOTION_COOKIE, 'reduce', expect.objectContaining({ path: '/', httpOnly: true }))
    await setReduceMotionAction(false)
    expect(jar.delete).toHaveBeenCalledWith(MOTION_COOKIE)
  })

  it('saves a light or dark theme, deletes it for System, and ignores anything else', async () => {
    await setThemeAction('dark')
    expect(jar.set).toHaveBeenCalledWith('theme', 'dark', expect.objectContaining({ path: '/' }))
    await setThemeAction('system')
    expect(jar.delete).toHaveBeenCalledWith('theme')
    jar.set.mockClear()
    await setThemeAction('purple')
    expect(jar.set).not.toHaveBeenCalled()
  })
})
