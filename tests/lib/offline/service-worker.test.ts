import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Runs the real public/sw.js in a fake worker scope: its own listeners, an in-memory Cache
// Storage, and a stubbed network.
const SOURCE = readFileSync(path.resolve(import.meta.dirname, '../../../public/sw.js'), 'utf8')
const ORIGIN = 'https://www.dwellduel.com'
const OFFLINE_HTML =
  '<html><head><link rel="stylesheet" href="/_next/static/chunks/app.css"></head>' +
  '<body><script src="/_next/static/chunks/main.js"></script>' +
  '<script>self.__next_f.push([1,"\\"/_next/static/chunks/main.js\\""])</script></body></html>'

type FakeRequest = { url: string; method: string; mode: string }
type Listener = (event: unknown) => void

const keyOf = (input: string | FakeRequest) => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href

function loadWorker(network: (url: string) => Promise<Response>, options: { locationHref?: string } = {}) {
  const listeners: Record<string, Listener> = {}
  const storage = new Map<string, Map<string, Response>>()
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const fetch = vi.fn((input: string | FakeRequest, init?: RequestInit) => {
    fetchCalls.push({ url: keyOf(input), init })
    return network(keyOf(input))
  })

  function openSync(name: string) {
    if (!storage.has(name)) storage.set(name, new Map())
    const entries = storage.get(name)!
    return {
      match: async (input: string | FakeRequest) => entries.get(keyOf(input))?.clone(),
      put: async (input: string | FakeRequest, response: Response) => void entries.set(keyOf(input), response),
      add: async (input: string) => {
        const response = await fetch(input)
        if (!response.ok) throw new TypeError(`Request failed: ${response.status}`)
        entries.set(keyOf(input), response)
      },
    }
  }

  const caches = {
    open: async (name: string) => openSync(name),
    keys: async () => [...storage.keys()],
    delete: async (name: string) => storage.delete(name),
    match: async (input: string | FakeRequest) => {
      for (const entries of storage.values()) {
        const hit = entries.get(keyOf(input))
        if (hit) return hit.clone()
      }
      return undefined
    },
  }

  const navigationPreloadEnable = vi.fn(async () => undefined)

  const scope: Record<string, unknown> = {
    caches,
    fetch,
    URL,
    Response,
    Promise,
    Set,
    Error,
    TypeError,
    // The scriptURL a worker was registered with (including its ?v= query) is what self.location
    // reflects inside the worker. Defaults to a fixed version so most tests can assert a stable
    // cache name; tests that care about versioning pass their own locationHref.
    location: { origin: ORIGIN, href: options.locationHref ?? `${ORIGIN}/sw.js?v=v1` },
    registration: { navigationPreload: { enable: navigationPreloadEnable } },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
  }
  scope.self = scope
  vm.runInNewContext(SOURCE, scope)

  async function lifecycle(type: 'install' | 'activate') {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]({ waitUntil: (promise: Promise<unknown>) => (done = promise) })
    await done
  }

  async function request(
    pathOrUrl: string,
    init: { method?: string; mode?: string; preloadResponse?: Promise<Response | undefined> } = {},
  ) {
    const pending: Promise<unknown>[] = []
    let responded: Promise<Response> | undefined
    listeners.fetch({
      request: { url: keyOf(pathOrUrl), method: init.method ?? 'GET', mode: init.mode ?? 'cors' },
      preloadResponse: init.preloadResponse ?? Promise.resolve(undefined),
      respondWith: (response: Promise<Response>) => (responded = response),
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    })
    const response = responded ? await responded : undefined
    await Promise.all(pending)
    return response
  }

  const cached = (name: string) => [...(storage.get(name)?.keys() ?? [])].map((key) => key.replace(ORIGIN, ''))

  return { fetch, fetchCalls, storage, scope, lifecycle, request, cached }
}

const ok = (body: string) => Promise.resolve(new Response(body, { status: 200 }))

function onlineNetwork(url: string) {
  if (url === `${ORIGIN}/offline`) return ok(OFFLINE_HTML)
  return ok(`body of ${url}`)
}

function offlineNetwork(): Promise<Response> {
  return Promise.reject(new TypeError('Failed to fetch'))
}

describe('public/sw.js', () => {
  it('precaches the offline page and every static asset its HTML references, then skips waiting', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')

    expect(worker.cached('dwellduel-v1').sort()).toEqual([
      '/_next/static/chunks/app.css',
      '/_next/static/chunks/main.js',
      '/offline',
    ])
    expect(worker.scope.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('fetches the offline page anonymously, uncached, never sending a session cookie', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')

    const offlineFetch = worker.fetchCalls.find((call) => call.url === `${ORIGIN}/offline`)
    expect(offlineFetch?.init).toMatchObject({ cache: 'no-store', credentials: 'omit' })
  })

  it('fails the install when the offline page cannot be fetched', async () => {
    const worker = loadWorker((url) => (url.endsWith('/offline') ? Promise.resolve(new Response('', { status: 500 })) : ok('')))
    await expect(worker.lifecycle('install')).rejects.toThrow('Precaching /offline failed with 500')
    expect(worker.scope.skipWaiting).not.toHaveBeenCalled()
  })

  it('fails the install when the offline page fetch was redirected', async () => {
    const worker = loadWorker((url) => {
      if (!url.endsWith('/offline')) return ok('')
      const response = new Response(OFFLINE_HTML, { status: 200 })
      Object.defineProperty(response, 'redirected', { value: true })
      return Promise.resolve(response)
    })
    await expect(worker.lifecycle('install')).rejects.toThrow('Precaching /offline was redirected')
    expect(worker.scope.skipWaiting).not.toHaveBeenCalled()
  })

  it("names its cache after the version in the worker's own registration URL", async () => {
    const worker = loadWorker(onlineNetwork, { locationHref: `${ORIGIN}/sw.js?v=2026-09-26-abc123` })
    await worker.lifecycle('install')

    expect(worker.cached('dwellduel-2026-09-26-abc123')).toContain('/offline')
  })

  it('falls back to a dev cache name when the registration URL carries no version', async () => {
    const worker = loadWorker(onlineNetwork, { locationHref: `${ORIGIN}/sw.js` })
    await worker.lifecycle('install')

    expect(worker.cached('dwellduel-dev')).toContain('/offline')
  })

  it('deletes caches from older versions on activate and claims open pages', async () => {
    const worker = loadWorker(onlineNetwork)
    worker.storage.set('dwellduel-v0', new Map())
    await worker.lifecycle('install')
    await worker.lifecycle('activate')

    expect([...worker.storage.keys()]).toEqual(['dwellduel-v1'])
    expect((worker.scope.clients as { claim: () => void }).claim).toHaveBeenCalledTimes(1)
  })

  it('enables navigation preload on activate', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')
    await worker.lifecycle('activate')

    const registration = worker.scope.registration as { navigationPreload: { enable: () => void } }
    expect(registration.navigationPreload.enable).toHaveBeenCalledTimes(1)
  })

  it('serves static assets cache-first, fetching each once', async () => {
    const worker = loadWorker(onlineNetwork)
    const first = await worker.request('/_next/static/chunks/page-abc123.js')
    const second = await worker.request('/_next/static/chunks/page-abc123.js')

    expect(await first!.text()).toBe(`body of ${ORIGIN}/_next/static/chunks/page-abc123.js`)
    expect(await second!.text()).toBe(`body of ${ORIGIN}/_next/static/chunks/page-abc123.js`)
    expect(worker.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed static asset response', async () => {
    const worker = loadWorker(() => Promise.resolve(new Response('', { status: 503 })))
    const response = await worker.request('/_next/static/chunks/page-abc123.js')

    expect(response!.status).toBe(503)
    expect(worker.cached('dwellduel-v1')).toEqual([])
  })

  it('answers navigations from the network and never caches them', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')
    const response = await worker.request('/markets', { mode: 'navigate' })

    expect(await response!.text()).toBe(`body of ${ORIGIN}/markets`)
    expect(worker.cached('dwellduel-v1')).not.toContain('/markets')
  })

  it('answers a navigation from the preload response without fetching the network', async () => {
    const worker = loadWorker(onlineNetwork)
    const preloadResponse = Promise.resolve(new Response('preloaded body'))
    const response = await worker.request('/markets', { mode: 'navigate', preloadResponse })

    expect(await response!.text()).toBe('preloaded body')
    expect(worker.fetch).not.toHaveBeenCalled()
  })

  it('falls back to fetching the network when navigation preload resolves with nothing', async () => {
    const worker = loadWorker(onlineNetwork)
    const response = await worker.request('/markets', { mode: 'navigate', preloadResponse: Promise.resolve(undefined) })

    expect(await response!.text()).toBe(`body of ${ORIGIN}/markets`)
    expect(worker.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to the precached offline page when a navigation cannot reach the network', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')
    worker.fetch.mockImplementation(offlineNetwork)

    const response = await worker.request('/markets/3f2a', { mode: 'navigate' })
    expect(await response!.text()).toBe(OFFLINE_HTML)
  })

  it('falls back to the precached offline page when navigation preload itself rejects', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')

    const preloadResponse = Promise.reject(new TypeError('Failed to fetch'))
    const response = await worker.request('/markets/3f2a', { mode: 'navigate', preloadResponse })
    expect(await response!.text()).toBe(OFFLINE_HTML)
  })

  it('returns a network error for an offline navigation before the offline page is cached', async () => {
    const worker = loadWorker(offlineNetwork)
    const response = await worker.request('/markets', { mode: 'navigate' })
    expect(response!.type).toBe('error')
  })

  it.each([
    ['an RSC fetch', `${ORIGIN}/markets?_rsc=1x2y`, 'GET', 'cors'],
    ['a server action', `${ORIGIN}/markets/3f2a`, 'POST', 'cors'],
    ['a server action posted from a navigation', `${ORIGIN}/markets/3f2a`, 'POST', 'navigate'],
    ['the offline check', `${ORIGIN}/markets`, 'HEAD', 'cors'],
    ['a Supabase request', 'https://abc.supabase.co/rest/v1/markets?select=*', 'GET', 'cors'],
    ['a cross-origin navigation', 'https://accounts.google.com/o/oauth2/auth', 'GET', 'navigate'],
  ])('leaves %s to the browser untouched', async (_name, url, method, mode) => {
    const worker = loadWorker(onlineNetwork)
    const response = await worker.request(url, { method, mode })

    expect(response).toBeUndefined()
    expect(worker.fetch).not.toHaveBeenCalled()
  })
})
