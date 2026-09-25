import { describe, it, expect } from 'vitest'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'

describe('resolveTheme', () => {
  it('accepts the two saved themes', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('treats a missing or unknown cookie as no choice', () => {
    expect(resolveTheme(undefined)).toBeNull()
    expect(resolveTheme('')).toBeNull()
    expect(resolveTheme('purple')).toBeNull()
  })

  it('uses a stable cookie name', () => {
    expect(THEME_COOKIE).toBe('theme')
  })
})
