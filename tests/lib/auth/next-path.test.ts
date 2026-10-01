import { describe, it, expect } from 'vitest'
import { safeNextPath } from '@/lib/auth/next-path'

describe('safeNextPath (#263)', () => {
  it('keeps a signed-in app path, with its query', () => {
    expect(safeNextPath('/markets/0b7d8c1e-0000-4000-8000-000000000000')).toBe('/markets/0b7d8c1e-0000-4000-8000-000000000000')
    expect(safeNextPath('/bets?tab=settled')).toBe('/bets?tab=settled')
    expect(safeNextPath('/admin/markets')).toBe('/admin/markets')
  })

  it('drops a fragment, which never reaches the server anyway', () => {
    expect(safeNextPath('/how-it-works#how-results')).toBe('/how-it-works')
  })

  it.each([
    ['nothing', null],
    ['empty', ''],
    ['home, where sign-in goes anyway', '/'],
    ['a public page', '/sign-in'],
    ['the callback', '/callback'],
    ['the not-invited page', '/not-invited'],
    ['a protocol-relative URL', '//evil.example/markets'],
    ['a backslash read as a slash', '/\\evil.example'],
    ['an encoded backslash pair', '/\\/evil.example'],
    ['an absolute URL', 'https://evil.example/markets'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'markets'],
    ['a tab inside the slashes', '/\t/evil.example'],
    ['a newline', '/markets\nSet-Cookie: x=1'],
    ['a dot path that climbs out to //', '/markets/..//evil.example'],
    ['an over-long path', `/markets/${'a'.repeat(2100)}`],
  ])('refuses %s', (_, raw) => {
    expect(safeNextPath(raw)).toBeNull()
  })

  it('normalises a dot path that stays on an app page', () => {
    expect(safeNextPath('/markets/../bets')).toBe('/bets')
  })
})
