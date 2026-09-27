import { describe, it, expect } from 'vitest'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'

describe('chunk', () => {
  it('splits into runs of the given size, the last one shorter', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('gives no chunks for no items', () => {
    expect(chunk([], IN_CHUNK)).toEqual([])
  })

  it('keeps every item, in order, in chunks of at most IN_CHUNK', () => {
    const ids = Array.from({ length: 121 }, (_, i) => `id-${i}`)
    const chunks = chunk(ids, IN_CHUNK)
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 21])
    expect(chunks.flat()).toEqual(ids)
  })

  it('refuses a size that would loop forever', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError)
    expect(() => chunk([1], 1.5)).toThrow(RangeError)
  })
})
