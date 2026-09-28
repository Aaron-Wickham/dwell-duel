// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { LaunchScreen } from '@/components/brand/launch-screen'

function stubStandalone(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

// jsdom doesn't run scripts React renders, so run the cold-start script's text directly.
function runColdStartScript(container: HTMLElement) {
  new Function(container.querySelector('script')!.textContent!)()
}

beforeEach(() => {
  sessionStorage.clear()
  delete document.documentElement.dataset.launch
})

describe('LaunchScreen', () => {
  it('draws the D and four leaves, each leaf a little later than the last, hidden from assistive tech', () => {
    const { container } = render(<LaunchScreen />)
    const overlay = container.querySelector('.launch-screen')!
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    const leaves = [...overlay.querySelectorAll<SVGPathElement>('.launch-leaf')]
    expect(leaves.map((l) => l.style.animationDelay)).toEqual(['150ms', '270ms', '390ms', '510ms'])
    expect(overlay.querySelector('.fill-on-splash')).not.toBeNull()
  })

  it('shows only on an installed app’s cold start, once per session', () => {
    stubStandalone(true)
    const { container } = render(<LaunchScreen />)
    runColdStartScript(container)
    expect(document.documentElement.dataset.launch).toBe('')

    delete document.documentElement.dataset.launch
    runColdStartScript(container)
    expect(document.documentElement.dataset.launch).toBeUndefined()
  })

  it('never shows in a browser tab', () => {
    stubStandalone(false)
    const { container } = render(<LaunchScreen />)
    runColdStartScript(container)
    expect(document.documentElement.dataset.launch).toBeUndefined()
    expect(sessionStorage.getItem('dd-launched')).toBeNull()
  })
})
