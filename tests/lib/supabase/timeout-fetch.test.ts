import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout } from '@/lib/supabase/timeout-fetch'

function pendingFetch() {
  let capturedSignal: AbortSignal | undefined
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined
    return new Promise((_resolve, reject) => {
      capturedSignal?.addEventListener('abort', () => {
        reject(new DOMException('This operation was aborted', 'AbortError'))
      })
    })
  })
  return { fetchMock, getSignal: () => capturedSignal }
}

describe('fetchWithTimeout', () => {
  const realAbortSignalAny = AbortSignal.any
  const realAbortSignalTimeout = AbortSignal.timeout

  afterEach(() => {
    AbortSignal.any = realAbortSignalAny
    AbortSignal.timeout = realAbortSignalTimeout
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aborts after ms, using the fallback path when AbortSignal.any is missing', async () => {
    // @ts-expect-error -- simulating iOS Safari < 17.4, which has AbortSignal.timeout but not .any
    delete AbortSignal.any
    vi.useFakeTimers()
    const { fetchMock, getSignal } = pendingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const wrapped = fetchWithTimeout(10_000)
    const result = wrapped('https://example.com')
    let settled: 'pending' | 'rejected' = 'pending'
    result.catch(() => {
      settled = 'rejected'
    })

    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe('pending')
    expect(getSignal()?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(result).rejects.toThrow()
    expect(getSignal()?.aborted).toBe(true)
  })

  it('forwards a caller abort in the fallback path', async () => {
    // @ts-expect-error -- forcing the fallback path
    delete AbortSignal.any
    const { fetchMock, getSignal } = pendingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const callerController = new AbortController()
    const wrapped = fetchWithTimeout(10_000)
    const result = wrapped('https://example.com', { signal: callerController.signal })

    callerController.abort()
    await expect(result).rejects.toThrow()
    expect(getSignal()?.aborted).toBe(true)
  })

  it('clears its timer once the fetch settles, in the fallback path', async () => {
    // @ts-expect-error -- forcing the fallback path
    delete AbortSignal.any
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('ok'))),
    )

    const wrapped = fetchWithTimeout(10_000)
    await wrapped('https://example.com')

    expect(vi.getTimerCount()).toBe(0)
  })

  it('works without AbortSignal.any, forwarding init options through to fetch', async () => {
    // @ts-expect-error -- forcing the fallback path
    delete AbortSignal.any
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', fetchMock)

    const wrapped = fetchWithTimeout(10_000)
    await wrapped('https://example.com', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]
    expect(input).toBe('https://example.com')
    expect(init?.method).toBe('POST')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('uses AbortSignal.timeout/any directly when both are present, with no caller signal', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', fetchMock)

    const wrapped = fetchWithTimeout(10_000)
    await wrapped('https://example.com')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('combines the timeout with a caller signal via AbortSignal.any when both are present', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', fetchMock)
    const anySpy = vi.spyOn(AbortSignal, 'any')

    const callerController = new AbortController()
    const wrapped = fetchWithTimeout(10_000)
    await wrapped('https://example.com', { signal: callerController.signal })

    expect(anySpy).toHaveBeenCalledWith([expect.any(AbortSignal), callerController.signal])
  })
})
