// Both are cookies, like the theme, so the root layout can put them on <html> before any JS runs.
// Each cookie holds only the non-default choice; no cookie means the default.
export const HAPTICS_COOKIE = 'haptics'
export const MOTION_COOKIE = 'motion'

export type Preferences = { haptics: boolean; reduceMotion: boolean }

export function resolvePreferences(read: (name: string) => string | undefined): Preferences {
  return { haptics: read(HAPTICS_COOKIE) !== 'off', reduceMotion: read(MOTION_COOKIE) === 'reduce' }
}

// What the root layout spreads onto <html>. lib/haptics and lib/ui/reduced-motion read them back.
export function preferenceAttributes(prefs: Preferences): { 'data-haptics'?: 'off'; 'data-motion'?: 'reduce' } {
  return {
    ...(prefs.haptics ? {} : { 'data-haptics': 'off' as const }),
    ...(prefs.reduceMotion ? { 'data-motion': 'reduce' as const } : {}),
  }
}
