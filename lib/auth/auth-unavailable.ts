import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'

export class AuthUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Auth is unavailable', options)
    this.name = 'AuthUnavailableError'
  }
}

// "Unavailable" is network trouble, a timeout, a 5xx or an unknown failure -- Auth itself is
// having a bad time, so a member with a live session shouldn't be treated as signed out.
// Everything else (no session, a revoked or unknown refresh token, a bad JWT) is "signed out".
export function isAuthUnavailable(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true
  if (!isAuthError(error)) return false
  if (typeof error.status === 'number' && error.status >= 500) return true
  return error.name === 'AuthUnknownError'
}
