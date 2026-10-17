// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { init, captureException } = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ init, captureException, globalHandlersIntegration: () => ({}) }))

beforeEach(() => {
  vi.resetModules()
  init.mockReset()
  captureException.mockReset()
})

describe('reportClientError', () => {
  it('does nothing, and never loads the SDK, without a DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const { reportClientError } = await import('@/lib/observability/client')
    reportClientError(new Error('x'))
    await new Promise((r) => setTimeout(r, 0))
    expect(init).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('sends an error raised before the SDK is ready once it has initialised, and caps the count', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://k@o1.ingest.sentry.io/1')
    const { reportClientError } = await import('@/lib/observability/client')
    for (let i = 0; i < 15; i++) reportClientError(new Error(`e${i}`))
    expect(captureException).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(10))
    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.invocationCallOrder[0]).toBeLessThan(captureException.mock.invocationCallOrder[0])
  })
})

// #458: the SDK waits for an idle main thread, and an uncaught error before then still arrives.
describe('startClientSentryWhenIdle', () => {
  const DSN = 'https://k@o1.ingest.sentry.io/1'
  let idle: { callback: () => void; timeout?: number }[]

  beforeEach(() => {
    idle = []
    vi.stubGlobal('requestIdleCallback', (callback: () => void, options?: { timeout?: number }) => {
      idle.push({ callback, timeout: options?.timeout })
      return idle.length
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  // Cancelled, so the test runner doesn't take the stand-in for a real uncaught error.
  const uncaught = (error: Error) => {
    const event = new ErrorEvent('error', { error, message: error.message, cancelable: true })
    window.addEventListener('error', (e) => e.preventDefault(), { once: true, capture: true })
    window.dispatchEvent(event)
  }

  it('does nothing without a DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const { startClientSentryWhenIdle } = await import('@/lib/observability/client')
    startClientSentryWhenIdle()
    expect(idle).toEqual([])
  })

  it('loads the SDK only once the browser is idle, with a timeout', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    const { startClientSentryWhenIdle, SENTRY_IDLE_TIMEOUT_MS } = await import('@/lib/observability/client')
    startClientSentryWhenIdle()
    await new Promise((r) => setTimeout(r, 0))
    expect(init).not.toHaveBeenCalled()
    expect(idle).toHaveLength(1)
    expect(idle[0].timeout).toBe(SENTRY_IDLE_TIMEOUT_MS)
    idle[0].callback()
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1))
  })

  it('waits on a timer where the browser has no requestIdleCallback', async () => {
    vi.stubGlobal('requestIdleCallback', undefined)
    vi.useFakeTimers()
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    const { startClientSentryWhenIdle, SENTRY_IDLE_TIMEOUT_MS } = await import('@/lib/observability/client')
    startClientSentryWhenIdle()
    expect(init).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SENTRY_IDLE_TIMEOUT_MS)
    vi.useRealTimers()
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1))
  })

  it('sends an uncaught error raised before the SDK loads, once, and leaves later ones to Sentry’s own handlers', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    const { startClientSentryWhenIdle } = await import('@/lib/observability/client')
    startClientSentryWhenIdle()
    const early = new Error('early')
    uncaught(early)
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledWith(early))
    expect(init).toHaveBeenCalledTimes(1)

    uncaught(new Error('later'))
    await new Promise((r) => setTimeout(r, 0))
    expect(captureException).toHaveBeenCalledTimes(1)
  })
})
