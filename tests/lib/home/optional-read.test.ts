import { afterEach, describe, expect, it, vi } from 'vitest'
import { optionalRead } from '@/lib/home/optional-read'

afterEach(() => {
  vi.restoreAllMocks()
})

// HOME-1: one failed optional read leaves its block out instead of failing Home.
describe('optionalRead', () => {
  it('returns what the read returns', async () => {
    expect(await optionalRead('the weekly recap', async () => 7, null)).toBe(7)
  })

  it('logs a failure and returns the fallback', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('db down')
    expect(await optionalRead('the weekly recap', async () => Promise.reject(failure), null)).toBeNull()
    expect(log).toHaveBeenCalledWith('Reading the weekly recap failed', failure)
  })

  it('catches a read that throws before it returns a promise', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const read = (): Promise<number> => {
      throw new Error('bad client')
    }
    expect(await optionalRead('markets to resolve', read, 0)).toBe(0)
  })
})
