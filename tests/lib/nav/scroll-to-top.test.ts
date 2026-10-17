// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MouseEvent } from 'react'
import { scrollToTopOnCurrentTab } from '@/lib/nav/scroll-to-top'

function click(init: Partial<Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>> = {}) {
  const preventDefault = vi.fn()
  const event = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault, ...init }
  return { event: event as unknown as MouseEvent<HTMLAnchorElement>, preventDefault }
}

const scrollTo = vi.fn()

beforeEach(() => {
  scrollTo.mockReset()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
  delete document.documentElement.dataset.motion
})

describe('scrollToTopOnCurrentTab', () => {
  it('scrolls smoothly to the top instead of navigating to the page you are on', () => {
    window.history.replaceState(null, '', '/markets')
    const { event, preventDefault } = click()
    scrollToTopOnCurrentTab(event, '/markets')
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('jumps at once under reduced motion, from Settings or the device', () => {
    window.history.replaceState(null, '', '/')
    document.documentElement.dataset.motion = 'reduce'
    scrollToTopOnCurrentTab(click().event, '/')
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })

    delete document.documentElement.dataset.motion
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    scrollToTopOnCurrentTab(click().event, '/')
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  })

  it('navigates as usual from a page below the tab or another view of it', () => {
    for (const here of ['/markets/123', '/bets?tab=settled', '/leaderboard?tab=month']) {
      window.history.replaceState(null, '', here)
      const tab = here.split(/[/?]/)[1]
      const { event, preventDefault } = click()
      scrollToTopOnCurrentTab(event, `/${tab}`)
      expect(preventDefault).not.toHaveBeenCalled()
    }
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('leaves a modified or already handled click alone', () => {
    window.history.replaceState(null, '', '/tasks')
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      const { event, preventDefault } = click(init)
      scrollToTopOnCurrentTab(event, '/tasks')
      expect(preventDefault).not.toHaveBeenCalled()
    }
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
