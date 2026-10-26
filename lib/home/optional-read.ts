import { unstable_rethrow } from 'next/navigation'
import { AuthUnavailableError, isAuthUnavailable } from '@/lib/auth/auth-unavailable'

// A Home block that can be left out (HOME-1): if its read fails, the failure is logged and the page
// renders without the block, rather than one flaky read blanking the balance and bets with it.
// Next's own interrupts (a redirect, notFound, a dynamic bail-out) and Auth being down still go up:
// those aren't this block's failure, and the error page says what to do about Auth.
export async function optionalRead<T>(what: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch (error: unknown) {
    unstable_rethrow(error)
    if (error instanceof AuthUnavailableError || isAuthUnavailable(error)) throw error
    console.error(`Reading ${what} failed`, error)
    return fallback
  }
}
