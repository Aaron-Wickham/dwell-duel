import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export class AuthUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Auth is unavailable', options)
    this.name = 'AuthUnavailableError'
  }
}

// "Unavailable" is network trouble, a timeout, a 5xx, a 429, or an unknown failure -- Auth itself
// is having a bad time, so a member with a live session shouldn't be treated as signed out.
// Everything else (no session, a revoked or unknown refresh token, a bad JWT) is "signed out".
export function isAuthUnavailable(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true
  if (!isAuthError(error)) return false
  if (typeof error.status === 'number' && (error.status >= 500 || error.status === 429)) return true
  return error.name === 'AuthUnknownError'
}

type ClaimsResult = { data: { claims: { sub: string; email?: string } } | null; error: unknown }

// getClaims() only turns a recognised AuthError into { data: null, error } -- a malformed cookie
// value can instead escape as a thrown SyntaxError (decodeJWT's unguarded JSON.parse), Error
// (a bad alg claim), DOMException (a mismatched JWK) or TypeError (a non-string token). None of
// that means Auth is down, so we fold it -- and claims that verify but carry no sub -- into "no
// session" instead of letting it lock every caller out.
export async function readClaims(supabase: SupabaseClient): Promise<ClaimsResult> {
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (error) return { data: null, error }
    if (!data?.claims?.sub) return { data: null, error: null }
    return { data: { claims: { sub: data.claims.sub, email: data.claims.email } }, error: null }
  } catch {
    return { data: null, error: null }
  }
}
