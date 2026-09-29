import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { DURATION, EASE, ICON_POP, PILL_SLIDE, PILL_TRANSITION, cssEase } from '@/lib/ui/motion'

const root = path.resolve(import.meta.dirname, '../../..')
const css = readFileSync(path.join(root, 'app/globals.css'), 'utf8')
const tokenBlock = /@theme static \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

function cssToken(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(tokenBlock)?.[1].trim()
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) ? [full] : []
  })
}

describe('motion tokens', () => {
  it('has a static @theme block of motion tokens in globals.css', () => {
    expect(tokenBlock).not.toBe('')
  })

  it('mirrors every ease in lib/ui/motion.ts', () => {
    const cssEases = [...tokenBlock.matchAll(/--ease-([\w-]+):/g)].map((m) => m[1]).sort()
    expect(cssEases).toEqual(Object.keys(EASE).sort())
    for (const name of Object.keys(EASE) as (keyof typeof EASE)[]) {
      expect(cssToken(`ease-${name}`)).toBe(cssEase(name))
    }
  })

  it('mirrors every duration in lib/ui/motion.ts', () => {
    const cssDurations = [...tokenBlock.matchAll(/--duration-([\w-]+):/g)].map((m) => m[1]).sort()
    expect(cssDurations).toEqual(Object.keys(DURATION).sort())
    for (const [name, ms] of Object.entries(DURATION)) {
      expect(cssToken(`duration-${name}`)).toBe(`${ms}ms`)
    }
  })

  it('slides every pill the same way, in WAAPI and in Motion', () => {
    expect(PILL_SLIDE).toEqual({ duration: DURATION.slide, easing: cssEase('ios') })
    expect(PILL_TRANSITION).toEqual({ type: 'tween', duration: DURATION.slide / 1000, ease: [...EASE.ios] })
  })

  it('pops the tab icon over the pill’s own slide', () => {
    expect(ICON_POP).toMatchObject({ duration: PILL_TRANSITION.duration, ease: PILL_TRANSITION.ease })
  })

  it('keeps every curve in the token block or its mirror', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap((dir) => sourceFiles(path.join(root, dir)))
      .flatMap((file) => {
        let text = readFileSync(file, 'utf8')
        if (file.endsWith(path.join('app', 'globals.css'))) text = text.replace(tokenBlock, '')
        return text.includes('cubic-bezier(') ? [path.relative(root, file)] : []
      })
      .filter((file) => file !== path.join('lib', 'ui', 'motion.ts'))
    expect(offenders).toEqual([])
  })

  // Sonner's stylesheet only listens to the device setting.
  it("stills Sonner's toasts for Settings' Reduce animations too", () => {
    const rule = /:root\[data-motion="reduce"\] :is\(([^)]*)\)\s*\{([^}]*)\}/.exec(css)
    expect(rule?.[1]).toContain('[data-sonner-toast]')
    expect(rule?.[2]).toMatch(/transition:\s*none !important/)
    expect(rule?.[2]).toMatch(/animation:\s*none !important/)
  })
})
