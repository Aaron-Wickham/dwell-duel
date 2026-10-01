import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createClient } from '@supabase/supabase-js'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithTimeout } from '@/lib/supabase/timeout-fetch'

const { captureException, flush } = vi.hoisted(() => ({ captureException: vi.fn(), flush: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException, flush }))
vi.mock('next/server', () => ({ after: vi.fn() }))

async function loadReport() {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/1')
  return import('@/lib/observability/report')
}

beforeEach(() => {
  captureException.mockReset()
  flush.mockReset().mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

describe('reportError', () => {
  it('sends a PostgREST error object as an Error naming what failed, without its details', async () => {
    const { reportError, flushErrors } = await loadReport()
    reportError('Closing alerts failed', { message: 'permission denied', details: 'Key (note)=(member text)', hint: '', code: '42501' })
    await flushErrors()
    const [sent, hint] = captureException.mock.calls[0]
    expect(sent).toBeInstanceOf(Error)
    expect(sent.message).toBe('Closing alerts failed: permission denied (42501)')
    expect(sent.message).not.toContain('member text')
    expect(sent.stack).toContain('observability-report.test.ts')
    expect(hint).toEqual({ tags: { context: 'Closing alerts failed' } })
  })

  it('sends an Error as it is', async () => {
    const { reportError, flushErrors } = await loadReport()
    const error = new Error('boom')
    reportError('x', error)
    await flushErrors()
    expect(captureException).toHaveBeenCalledWith(error, { tags: { context: 'x' } })
  })

  // Sentry's 2026-10-01 "TimeoutError: The operation was aborted due to timeout" events were a Supabase
  // call hitting the service client's timeout: caught by postgrest-js, returned as a plain object and
  // reported once by the route, not an unhandled rejection.
  it('reports a timed-out Supabase call once, and nothing is left to reject unhandled', async () => {
    const server: Server = createServer((req) => req.resume()).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const db = createClient(url, 'sb_secret_test', { auth: { persistSession: false }, global: { fetch: fetchWithTimeout(50) } })
      const { error } = await db.rpc('claim_cron_lease', {})
      expect(error?.message).toBe('TimeoutError: The operation was aborted due to timeout')

      const { reportError, flushErrors } = await loadReport()
      reportError('Closing alerts failed', error)
      await flushErrors()
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(captureException).toHaveBeenCalledTimes(1)
      expect(captureException.mock.calls[0][0].message).toBe('Closing alerts failed: TimeoutError: The operation was aborted due to timeout')
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
      server.closeAllConnections()
      server.close()
    }
  })
})
