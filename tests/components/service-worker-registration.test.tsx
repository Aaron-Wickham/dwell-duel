// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ServiceWorkerRegistration } from '@/components/offline/service-worker-registration'

const register = vi.fn()
const unregister = vi.fn()
const getRegistrations = vi.fn()

beforeEach(() => {
  register.mockReset().mockResolvedValue({})
  unregister.mockReset().mockResolvedValue(true)
  getRegistrations.mockReset().mockResolvedValue([{ unregister }])
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, getRegistrations },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('ServiceWorkerRegistration', () => {
  it('registers /sw.js for the whole site in production, versioned by the build', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { container } = render(<ServiceWorkerRegistration />)
    // NEXT_PUBLIC_SW_VERSION is inlined by next.config.ts's `env` at build time, so the module
    // under test reads it as undefined here (unset in this test run); sw.js has its own 'dev'
    // fallback for a worker registered without the query param.
    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js?v=undefined', { scope: '/' }))
    expect(container).toBeEmptyDOMElement()
  })

  it('never registers in development, and removes a worker left by a local production run', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    render(<ServiceWorkerRegistration />)
    await waitFor(() => expect(unregister).toHaveBeenCalledTimes(1))
    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing where service workers are unsupported', () => {
    vi.stubEnv('NODE_ENV', 'production')
    Reflect.deleteProperty(navigator, 'serviceWorker')
    expect(() => render(<ServiceWorkerRegistration />)).not.toThrow()
    expect(register).not.toHaveBeenCalled()
  })
})
