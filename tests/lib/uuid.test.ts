import { describe, it, expect } from 'vitest'
import { isUuid } from '@/lib/uuid'

describe('isUuid', () => {
  it('accepts a canonical uuid in either case', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true)
    expect(isUuid('3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b')).toBe(true)
    expect(isUuid('3F2B8C1E-9D4A-4E6B-8A7C-1B2D3E4F5A6B')).toBe(true)
  })

  it('rejects anything Postgres would refuse to compare with a uuid column', () => {
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid('new')).toBe(false)
    expect(isUuid('3f2b8c1e9d4a4e6b8a7c1b2d3e4f5a6b')).toBe(false)
    expect(isUuid('3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6')).toBe(false)
    expect(isUuid('3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6bb')).toBe(false)
    expect(isUuid(' 3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b')).toBe(false)
    expect(isUuid('g3f2b8c1-9d4a-4e6b-8a7c-1b2d3e4f5a6b')).toBe(false)
  })
})
