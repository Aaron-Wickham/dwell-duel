export const ALWAYS_REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const
export const PRODUCTION_REQUIRED = ['SUPABASE_SECRET_KEY', 'CRON_SECRET', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const

// Every var this app needs before it can safely serve a request. `env` is an explicit parameter,
// not a read of `process.env`, so this stays pure and easy to test with any combination of vars.
export function missingEnv(env: Record<string, string | undefined>): string[] {
  const required: readonly string[] =
    env.VERCEL_ENV === 'production' ? [...ALWAYS_REQUIRED, ...PRODUCTION_REQUIRED] : ALWAYS_REQUIRED
  return required.filter((name) => !env[name])
}

// Thrown from instrumentation.ts's register(), once, before the server accepts its first request.
// The message names only the missing variables -- never a value, even an already-present one.
export function assertRequiredEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = missingEnv(env)
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
