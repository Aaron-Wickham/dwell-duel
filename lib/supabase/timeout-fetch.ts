export const SERVER_FETCH_TIMEOUT_MS = 10_000
export const BROWSER_FETCH_TIMEOUT_MS = 15_000

// iOS Safari before 17.4 has no AbortSignal.any, so a caller-supplied signal is combined with a
// manual AbortController and a plain setTimeout there instead of composing native signals.
export function fetchWithTimeout(ms: number): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const callerSignal = init?.signal

    if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
      const timeoutSignal = AbortSignal.timeout(ms)
      const signal = callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal
      return fetch(input, { ...init, signal })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    const onCallerAbort = () => controller.abort()
    callerSignal?.addEventListener('abort', onCallerAbort)

    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer)
      callerSignal?.removeEventListener('abort', onCallerAbort)
    })
  }) as typeof fetch
}
