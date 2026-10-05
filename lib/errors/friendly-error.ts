import { reportError } from '@/lib/observability/report'

export const GENERIC_ERROR = 'Something went wrong. Try again.'
export const SIGNED_OUT_ERROR = 'You’re signed out. Sign in again.'

// `match` is either an RPC's exact `raise exception` text or a constraint's name, which Postgres
// quotes inside a check or unique violation's message.
export type KnownError<F extends string> = { match: string; formError: string; field?: F }

// Raw Postgres text reads badly and can leak table names, so only known errors reach the member
// as they are; anything else is logged for us and shown as a generic message.
export function friendlyError<F extends string>(
  error: { message: string },
  known: readonly KnownError<F>[],
  context: string,
): { formError: string; field?: F } {
  const hit = known.find(({ match }) => error.message === match || error.message.includes(`"${match}"`))
  if (!hit) {
    reportError(context, error)
    return { formError: GENERIC_ERROR }
  }
  return hit.field ? { formError: hit.formError, field: hit.field } : { formError: hit.formError }
}
