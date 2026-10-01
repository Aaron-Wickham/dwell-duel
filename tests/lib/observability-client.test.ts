import { describe, it, expect, vi, beforeEach } from 'vitest'

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
