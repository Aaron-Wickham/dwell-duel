export const ALWAYS_REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const
export const PRODUCTION_REQUIRED = ['SUPABASE_SECRET_KEY', 'CRON_SECRET'] as const
// Push degrades on its own without these (nothing is sent, Settings says notifications aren't
// available), so a production boot warns about them instead of refusing to serve (#210).
export const PRODUCTION_WARNED = ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const

// Every var this app needs before it can safely serve a request. `env` is an explicit parameter,
// not a read of `process.env`, so this stays pure and easy to test with any combination of vars.
export function missingEnv(env: Record<string, string | undefined>): string[] {
  const required: readonly string[] =
    env.VERCEL_ENV === 'production' ? [...ALWAYS_REQUIRED, ...PRODUCTION_REQUIRED] : ALWAYS_REQUIRED
  return required.filter((name) => !env[name])
}

// The production vars whose absence only switches a feature off.
export function missingWarnedEnv(env: Record<string, string | undefined>): string[] {
  return env.VERCEL_ENV === 'production' ? PRODUCTION_WARNED.filter((name) => !env[name]) : []
}

// Thrown from instrumentation.ts's register(), once, before the server accepts its first request.
// The message names only the missing variables -- never a value, even an already-present one.
export function assertRequiredEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = missingEnv(env)
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

export function warnMissingEnv(env: Record<string, string | undefined> = process.env, warn: (message: string) => void = console.warn): void {
  const missing = missingWarnedEnv(env)
  if (missing.length > 0) {
    warn(`Missing environment variables: ${missing.join(', ')}. Push notifications are off until they are set.`)
  }
}
