// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InstallApp } from '@/app/(app)/settings/install-app'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

function setDevice({ userAgent, standalone = false, touchPoints = 5 }: { userAgent: string; standalone?: boolean; touchPoints?: number }) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  // jsdom has no maxTouchPoints, so it is defined here and removed after each test.
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => touchPoints })
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'maxTouchPoints')
})

describe('InstallApp', () => {
  it('tells iPhone users to use the Share sheet', () => {
    setDevice({ userAgent: IPHONE })
    render(<InstallApp />)
    const card = screen.getByRole('region', { name: 'Install the app' })
    expect(card).toHaveTextContent('Tap Share, then Add to Home Screen.')
  })

  it('treats an iPad that reports itself as a Mac as iOS', () => {
    setDevice({ userAgent: IPAD_AS_MAC, touchPoints: 5 })
    render(<InstallApp />)
    expect(screen.getByRole('region', { name: 'Install the app' })).toHaveTextContent('Tap Share, then Add to Home Screen.')
  })

  it('tells Android users to use the browser menu', () => {
    setDevice({ userAgent: ANDROID })
    render(<InstallApp />)
    expect(screen.getByRole('region', { name: 'Install the app' })).toHaveTextContent('Open the menu, then Install app.')
  })

  it.each([
    ['a desktop browser', DESKTOP, 0],
    ['a Mac without a touch screen', IPAD_AS_MAC, 0],
  ])('stays hidden on %s', (_name, userAgent, touchPoints) => {
    setDevice({ userAgent, touchPoints })
    const { container } = render(<InstallApp />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden when already running from the home screen', () => {
    setDevice({ userAgent: IPHONE, standalone: true })
    const { container } = render(<InstallApp />)
    expect(container).toBeEmptyDOMElement()
  })
})
