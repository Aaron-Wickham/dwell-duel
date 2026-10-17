// No '@/' imports: next.config.ts imports this file too, for /sw.js's policy.

type PolicyOptions = {
  // The proxy's per-request nonce. Next reads it from the request's own CSP header and puts it on
  // every script it renders; null for a response no page renders into (/sw.js).
  nonce: string | null
  // The app's own pre-paint inline scripts, allowed by their text's hash (lib/security/script-hashes.ts).
  scriptHashes?: readonly string[]
}

// Scripts and connections only to DwellDuel itself and its Supabase project; nothing frames the app
// (clickjacking on admin actions). No 'unsafe-inline' for scripts (#449): an injected inline script
// carries neither the nonce nor an allowed hash, so it doesn't run. Dev mode needs 'unsafe-eval'.
// Sign-in leaves for Google by navigation and comes back by Google's own form post, so nothing of
// Google's loads here.
export function contentSecurityPolicy({ nonce, scriptHashes = [] }: PolicyOptions): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const realtime = supabase.replace(/^http/, 'ws')
  const dev = process.env.NODE_ENV === 'development'
  const scripts = [
    "'self'",
    ...(nonce ? [`'nonce-${nonce}'`] : []),
    ...scriptHashes,
    // Vercel Analytics and Speed Insights: same-origin in production, va.vercel-scripts.com otherwise.
    'https://va.vercel-scripts.com',
    ...(dev ? ["'unsafe-eval'"] : []),
  ]
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "frame-src 'self'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    // Sentry's ingest hosts (o123.ingest.us.sentry.io and the like), for client error reports.
    `connect-src 'self' ${supabase} ${realtime} https://*.sentry.io`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

// 128 random bits, fresh for every request, so a page's nonce can't be guessed from another's.
export function newNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
}
