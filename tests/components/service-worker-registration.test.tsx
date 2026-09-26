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
  it('registers /sw.js for the whole site in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { container } = render(<ServiceWorkerRegistration />)
    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' }))
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
