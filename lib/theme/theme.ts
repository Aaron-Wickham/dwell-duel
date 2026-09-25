export const THEME_COOKIE = 'theme'

export type Theme = 'light' | 'dark'

export function resolveTheme(value: string | undefined): Theme | null {
  return value === 'light' || value === 'dark' ? value : null
}
