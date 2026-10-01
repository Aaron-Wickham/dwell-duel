import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { hashNonce, idTokenNonce, newNonce } from '@/lib/auth/google-sign-in'

const jwt = (payload: unknown) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`

describe('Google sign-in nonces', () => {
  it('makes 32 random bytes, base64url', () => {
    const a = newNonce()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newNonce()).not.toBe(a)
  })

  it('hashes as Supabase compares: SHA-256 of the raw nonce, lowercase hex', () => {
    expect(hashNonce('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
    expect(hashNonce('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('reads the token’s nonce claim, or null for anything else', () => {
    expect(idTokenNonce(jwt({ nonce: 'n1' }))).toBe('n1')
    expect(idTokenNonce(jwt({ nonce: 7 }))).toBeNull()
    expect(idTokenNonce(jwt({}))).toBeNull()
    expect(idTokenNonce('not-a-token')).toBeNull()
    expect(idTokenNonce('a.%%%.c')).toBeNull()
  })
})
