// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PLAY_ONCE_PER_SESSION } from '@/components/sign-in/sign-in-intro'
import { SampleMarket } from '@/components/sign-in/sample-market'
import { INTRO, INTRO_CSS_DELAYS, SAMPLE } from '@/components/sign-in/intro-timeline'
import { DURATION } from '@/lib/ui/motion'

function runScript({ reduceDevice = false }: { reduceDevice?: boolean } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduceDevice && query.includes('reduce') }))
  new Function(PLAY_ONCE_PER_SESSION)()
  return 'signInIntro' in document.documentElement.dataset
}

beforeEach(() => {
  sessionStorage.clear()
  delete document.documentElement.dataset.signInIntro
  delete document.documentElement.dataset.motion
  document.documentElement.removeAttribute('style')
})

afterEach(() => vi.unstubAllGlobals())

describe('the sign-in intro’s pre-paint script', () => {
  it('plays the first time in a session, and not again', () => {
    expect(runScript()).toBe(true)
    delete document.documentElement.dataset.signInIntro
    expect(runScript()).toBe(false)
  })

  it('writes the CSS half’s delays from INTRO as it starts the intro', () => {
    expect(runScript()).toBe(true)
    const style = document.documentElement.style
    expect(style.getPropertyValue('--intro-backdrop-at')).toBe(`${INTRO.shrinkAt}ms`)
    expect(style.getPropertyValue('--intro-hide-at')).toBe(`${INTRO.shrinkAt + DURATION.sheet}ms`)
    expect(style.getPropertyValue('--intro-card-at')).toBe(`${INTRO.cardAt}ms`)
    expect(style.getPropertyValue('--intro-bet-at')).toBe(`${INTRO.bets[0].at}ms`)
  })

  it('writes no delays when it doesn’t play', () => {
    expect(runScript({ reduceDevice: true })).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--intro-card-at')).toBe('')
  })

  it('starts on the final frame under the device’s reduced motion', () => {
    expect(runScript({ reduceDevice: true })).toBe(false)
  })

  it('starts on the final frame under Settings’ Reduce animations', () => {
    document.documentElement.dataset.motion = 'reduce'
    expect(runScript()).toBe(false)
  })
})

describe('the intro timeline', () => {
  it('runs in the approved order: leaves, shrink, card, bets', () => {
    expect(INTRO.shrinkAt).toBe(900)
    expect(INTRO.cardAt).toBeGreaterThan(INTRO.shrinkAt)
    expect(INTRO.cardAt).toBeLessThan(INTRO.shrinkAt + 450)
    expect(INTRO.bets.map((bet) => bet.at)).toEqual([...INTRO.bets.map((bet) => bet.at)].sort((a, b) => a - b))
    expect(INTRO.bets[0].at).toBeGreaterThan(INTRO.cardAt)
    expect(INTRO.endAt).toBeLessThanOrEqual(2600)
  })

  it('counts Yes from 54% to 61%', () => {
    expect(SAMPLE.history.at(-1)).toBe(54)
    expect(INTRO.bets.at(-1)!.yes).toBe(61)
    expect(SAMPLE.yes).toBe(61)
  })
})

// The delays live in INTRO alone (#383): the CSS reads them, so the two can't drift.
describe('the intro’s CSS', () => {
  const css = readFileSync(path.resolve(import.meta.dirname, '../../app/globals.css'), 'utf8')
  const intro = css.slice(css.indexOf('/* Sign-in intro'), css.indexOf('/* LeafLoader'))

  it('keeps no delay of its own', () => {
    const rules = [...intro.matchAll(/animation:([^;]+);/g)].map((m) => m[1])
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) expect(rule, rule).not.toMatch(/\d+m?s\b/)
  })

  it('reads every delay INTRO writes', () => {
    for (const name of Object.keys(INTRO_CSS_DELAYS)) expect(intro).toContain(`var(${name})`)
  })
})

describe('SampleMarket', () => {
  it('rests on its final frame without the intro', () => {
    render(<SampleMarket />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Sample market: Will the sermon run past noon? Yes 61%, No 39%.')
  })
})
