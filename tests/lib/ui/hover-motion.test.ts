import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.resolve(import.meta.dirname, '../../../app/globals.css'), 'utf8')

// The body of `@utility <name> { … }`, braces balanced.
function utility(name: string): string {
  const start = css.indexOf(`@utility ${name} {`)
  expect(start, name).toBeGreaterThan(-1)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  throw new Error(`unclosed @utility ${name}`)
}

// The body of the first block opened by `opener` inside `text`.
function block(text: string, opener: string): string {
  const start = text.indexOf(opener)
  if (start === -1) return ''
  let depth = 0
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  return ''
}

const FINE_HOVER = '@media (hover: hover) and (pointer: fine)'

// jsdom has no hover or media queries, so the rules themselves are what's guarded (#155, #383).
describe('desktop hover motion', () => {
  const pressable = utility('pressable')
  const lift = utility('hover-lift')

  it('never grows a control on hover, only presses it (#383)', () => {
    expect(pressable).not.toContain(':hover')
    expect(pressable).not.toMatch(/scale: 1\.\d/)
    expect(pressable).toMatch(/&:active:not\([^)]*\)[^{]*\{\s*scale: 0\.97;/)
  })

  it('lifts cards only under a real mouse', () => {
    const fine = block(lift, FINE_HOVER)
    expect(fine).toMatch(/&\.pressable:hover:not\(:active\) \{\s*translate: 0 -2px;\s*box-shadow: var\(--lift-shadow\);/)
    expect(lift.replace(fine, '')).not.toContain('translate: 0 -2px')
  })

  it('drops the press and the lift under both kinds of reduced motion', () => {
    for (const reduced of ['@media (prefers-reduced-motion: reduce)', ':root[data-motion="reduce"] &']) {
      expect(block(pressable, reduced), reduced).toMatch(/:active[^{]*\{\s*scale: none;\s*opacity: 0\.7;/)
      expect(block(pressable, reduced), reduced).not.toMatch(/transition:[^;]*scale/)
    }
    const fineLift = block(lift, FINE_HOVER)
    expect(block(fineLift, '@media (prefers-reduced-motion: reduce)')).toContain('translate: none')
    expect(fineLift).toMatch(/:root\[data-motion="reduce"\] &\.pressable:hover:not\(:active\) \{\s*translate: none;/)
  })

  it('tints a row inside a card, flat, only under a real mouse (#244)', () => {
    const row = utility('hover-tint')
    expect(row).toMatch(/&::before \{[^}]*inset: var\(--tint-inset, -4px -10px\);[^}]*background-color: var\(--sunk\);[^}]*opacity: 0;/)
    expect(row).not.toMatch(/translate|box-shadow/)
    const fine = block(row, FINE_HOVER)
    expect(fine).toMatch(/&\.pressable:hover:not\(:active\)::before \{\s*opacity: 1;/)
    expect(row.replace(fine, '')).not.toContain('opacity: 1')
  })

  it('has a lift shadow in light, dark and the system dark fallback', () => {
    expect(css.match(/--lift-shadow:/g)).toHaveLength(3)
  })

  it('cross-fades a nav label over the pill’s slide, and at once under reduced motion', () => {
    const label = utility('pill-label')
    expect(label).toMatch(/&\.pressable \{\s*transition:[^;]*color var\(--duration-slide\) var\(--ease-ios\)/)
    for (const reduced of ['@media (prefers-reduced-motion: reduce)', ':root[data-motion="reduce"] &']) {
      expect(block(label, reduced), reduced).toMatch(/transition: background-color var\(--duration-hover\) ease-out;/)
    }
  })

  it('eases hover with the motion tokens', () => {
    expect(pressable).toContain('translate var(--duration-hover) var(--ease-ios)')
    expect(pressable).toContain('background-color var(--duration-hover)')
  })
})
