// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallCard, INSTALL_CARD_DISMISSED_KEY } from '@/components/home/install-card'

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

// Newer Node versions define their own global localStorage, which shadows jsdom's and is
// unusable without a backing file, so each test gets a fresh in-memory one.
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'maxTouchPoints')
})

describe('InstallCard', () => {
  it('tells iPhone users to use the Share sheet', () => {
    setDevice({ userAgent: IPHONE })
    render(<InstallCard />)
    const card = screen.getByRole('region', { name: 'Get the app' })
    expect(card).toHaveTextContent('Tap Share, then Add to Home Screen.')
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
  })

  it('treats an iPad that reports itself as a Mac as iOS', () => {
    setDevice({ userAgent: IPAD_AS_MAC, touchPoints: 5 })
    render(<InstallCard />)
    expect(screen.getByRole('region', { name: 'Get the app' })).toHaveTextContent('Tap Share, then Add to Home Screen.')
  })

  it('tells Android users to use the browser menu', () => {
    setDevice({ userAgent: ANDROID })
    render(<InstallCard />)
    expect(screen.getByRole('region', { name: 'Get the app' })).toHaveTextContent('Open the menu, then Install app.')
  })

  it.each([
    ['a desktop browser', DESKTOP, 0],
    ['a Mac without a touch screen', IPAD_AS_MAC, 0],
  ])('stays hidden on %s', (_name, userAgent, touchPoints) => {
    setDevice({ userAgent, touchPoints })
    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden when already running from the home screen', () => {
    setDevice({ userAgent: IPHONE, standalone: true })
    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hides on "Not now", remembers it, and moves focus to the page heading', async () => {
    setDevice({ userAgent: ANDROID })
    render(
      <>
        <h1>Welcome, Alice</h1>
        <InstallCard />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.queryByRole('region', { name: 'Get the app' })).toBeNull()
    expect(localStorage.getItem(INSTALL_CARD_DISMISSED_KEY)).toBe('1')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('still shows, and still hides on "Not now", when storage is unavailable', async () => {
    setDevice({ userAgent: IPHONE })
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    render(<InstallCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Get the app' })).toBeNull()
  })

  it('stays hidden after an earlier dismissal', () => {
    setDevice({ userAgent: IPHONE })
    localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, '1')
    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })
})
