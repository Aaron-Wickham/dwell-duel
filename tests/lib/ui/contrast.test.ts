import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.resolve(import.meta.dirname, '../../../app/globals.css'), 'utf8')

// The hex colour tokens declared directly in the first block opened by `opener`.
function tokens(opener: string): Map<string, string> {
  const start = css.indexOf(opener)
  expect(start, opener).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const out = new Map<string, string>()
  for (const [, name, hex] of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6});/g)) out.set(name, hex)
  return out
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const light = tokens(':root {')
const dark = tokens('[data-theme="dark"] {')
const systemDark = tokens(':root:not([data-theme="light"]) {')

// Text on the surface it sits on: WCAG AA for normal text.
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['ink', 'sunk'],
  ['ink2', 'surface'],
  ['ink2', 'sunk'],
  ['link', 'surface'],
  ['link', 'bg'],
  ['on-primary', 'primary'],
  ['on-lime', 'lime'],
  ['on-nav-active', 'nav-active'],
  ['on-tab-active', 'tab-active'],
  ['ink', 'segment-active'],
  ['acc-text', 'acc-soft'],
  ['win', 'win-soft'],
  ['loss', 'loss-soft'],
  ['gold', 'gold-soft'],
  ['on-hero', 'hero'],
]

// A control's edge against what it sits on: 3:1 for non-text contrast.
const EDGE_PAIRS: [string, string][] = [
  ['line-s', 'surface'],
  ['line-s', 'sunk'],
  ['line-s', 'acc-soft'],
]

// Dark inherits what it doesn't redeclare (lime, on-lime) from :root.
describe.each([
  ['light', light],
  ['dark', new Map([...light, ...dark])],
])('%s theme contrast', (_, theme) => {
  it.each(TEXT_PAIRS)('%s on %s passes AA', (fg, bg) => {
    expect(theme.get(fg), fg).toBeDefined()
    expect(theme.get(bg), bg).toBeDefined()
    expect(contrast(theme.get(fg)!, theme.get(bg)!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(EDGE_PAIRS)('%s on %s clears 3:1', (fg, bg) => {
    expect(contrast(theme.get(fg)!, theme.get(bg)!)).toBeGreaterThanOrEqual(3)
  })
})

describe('dark theme', () => {
  it('declares the same colours for an explicit choice and the system preference', () => {
    expect(Object.fromEntries(systemDark)).toEqual(Object.fromEntries(dark))
  })

  it('keeps lime off links and active navigation', () => {
    for (const name of ['link', 'nav-active', 'tab-active', 'segment-active']) {
      expect(dark.get(name), name).not.toBe(dark.get('primary'))
      expect(dark.get(name), name).not.toBe(dark.get('acc-text'))
    }
  })
})
