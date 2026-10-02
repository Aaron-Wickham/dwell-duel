// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PLAY_ONCE_PER_SESSION } from '@/components/sign-in/sign-in-intro'
import { SampleMarket } from '@/components/sign-in/sample-market'
import { INTRO, SAMPLE } from '@/components/sign-in/intro-timeline'

function runScript({ reduceDevice = false }: { reduceDevice?: boolean } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduceDevice && query.includes('reduce') }))
  new Function(PLAY_ONCE_PER_SESSION)()
  return 'signInIntro' in document.documentElement.dataset
}

beforeEach(() => {
  sessionStorage.clear()
  delete document.documentElement.dataset.signInIntro
  delete document.documentElement.dataset.motion
})

afterEach(() => vi.unstubAllGlobals())

describe('the sign-in intro’s pre-paint script', () => {
  it('plays the first time in a session, and not again', () => {
    expect(runScript()).toBe(true)
    delete document.documentElement.dataset.signInIntro
    expect(runScript()).toBe(false)
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

describe('SampleMarket', () => {
  it('rests on its final frame without the intro', () => {
    render(<SampleMarket />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Sample market: Will the sermon run past noon? Yes 61%, No 39%.')
  })
})
