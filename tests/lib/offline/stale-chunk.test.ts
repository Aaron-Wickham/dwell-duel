import { describe, it, expect, vi } from 'vitest'
import {
  STALE_CHUNK_RELOAD_COOLDOWN_MS,
  STALE_CHUNK_RELOAD_KEY,
  isChunkLoadError,
  reloadOnceForStaleChunk,
} from '@/lib/offline/stale-chunk'

function chunkError(message = 'Loading chunk 123 failed.') {
  const error = new Error(message)
  error.name = 'ChunkLoadError'
  return error
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('isChunkLoadError', () => {
  it('recognises webpack’s ChunkLoadError and each browser’s failed dynamic import', () => {
    expect(isChunkLoadError(chunkError())).toBe(true)
    expect(isChunkLoadError(new Error('Loading chunk app/(app)/markets/page failed.'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
  })

  it('leaves every other error alone', () => {
    expect(isChunkLoadError(new Error('boom'))).toBe(false)
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkLoadError('Loading chunk 1 failed')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('reloadOnceForStaleChunk', () => {
  const NOW = Date.parse('2026-09-29T12:00:00Z')

  it('reloads once for a stale chunk and remembers when', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    expect(reloadOnceForStaleChunk(chunkError(), { now: NOW, storage, reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.data.get(STALE_CHUNK_RELOAD_KEY)).toBe(String(NOW))
  })

  it('does not reload again inside the cooldown, so a broken build shows the error card instead of looping', () => {
    const storage = memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: String(NOW - 5_000) })
    const reload = vi.fn()
    expect(reloadOnceForStaleChunk(chunkError(), { now: NOW, storage, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads again once the cooldown has passed, for the next deploy the tab outlives', () => {
    const storage = memoryStorage({ [STALE_CHUNK_RELOAD_KEY]: String(NOW - STALE_CHUNK_RELOAD_COOLDOWN_MS) })
    const reload = vi.fn()
    expect(reloadOnceForStaleChunk(chunkError(), { now: NOW, storage, reload })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads for an ordinary error, without storage, or when storage throws', () => {
    const reload = vi.fn()
    expect(reloadOnceForStaleChunk(new Error('boom'), { now: NOW, storage: memoryStorage(), reload })).toBe(false)
    expect(reloadOnceForStaleChunk(chunkError(), { now: NOW, storage: null, reload })).toBe(false)
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
    }
    expect(reloadOnceForStaleChunk(chunkError(), { now: NOW, storage: throwing, reload })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
