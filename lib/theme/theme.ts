export const THEME_COOKIE = 'theme'

export type Theme = 'light' | 'dark'
// "system" is the absence of a saved theme: the page follows prefers-color-scheme.
export type ThemeChoice = Theme | 'system'

export function resolveTheme(value: string | undefined): Theme | null {
  return value === 'light' || value === 'dark' ? value : null
}
