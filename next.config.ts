import type { NextConfig } from 'next'

// Scripts and connections only to DwellDuel itself and its Supabase project; nothing frames the app
// (clickjacking on admin actions). Next's own inline scripts and the launch screen's cold-start
// script need 'unsafe-inline' without a per-request nonce, and dev mode needs 'unsafe-eval'.
// With a Google client ID set at build, the sign-in page also shows Google's own button, allowed
// from exactly the paths Google documents for Sign in with Google.
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const realtime = supabase.replace(/^http/, 'ws')
  const dev = process.env.NODE_ENV === 'development'
  const gis = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
  const google = (source: string) => (gis ? ` ${source}` : '')
  return [
    "default-src 'self'",
    // Vercel Analytics and Speed Insights: same-origin in production, va.vercel-scripts.com otherwise.
    `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${google('https://accounts.google.com/gsi/client')}${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'${google('https://accounts.google.com/gsi/style')}`,
    `frame-src 'self'${google('https://accounts.google.com/gsi/')}`,
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    // Sentry's ingest hosts (o123.ingest.us.sentry.io and the like), for client error reports.
    `connect-src 'self' ${supabase} ${realtime} https://*.sentry.io${google('https://accounts.google.com/gsi/')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const nextConfig: NextConfig = {
  // No reason to tell a scanner which framework answers.
  poweredByHeader: false,
  experimental: {
    useOffline: true,
  },
  // /how-it-works and /privacy render docs/HOW-IT-WORKS.md, read from disk (lib/docs/how-it-works.ts).
  outputFileTracingIncludes: {
    '/how-it-works': ['./docs/HOW-IT-WORKS.md'],
    '/privacy': ['./docs/HOW-IT-WORKS.md'],
  },
  // Next has no built-in way to read a deployment id from client code (deploymentId itself only
  // affects asset URLs and headers Next sets internally), so the per-deploy id is threaded
  // through as its own build-time env var. ServiceWorkerRegistration appends it to /sw.js's
  // registration URL, which is what makes each deploy install its own worker and cache.
  // VERCEL_DEPLOYMENT_ID comes first: a redeploy of the same commit (a rollback, a retry) gets a
  // new id, where the commit SHA would stay put and leave the old worker in place.
  env: {
    NEXT_PUBLIC_SW_VERSION: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  },
  // A service worker only updates when the browser sees new bytes at /sw.js, so neither the
  // browser nor Vercel's CDN may keep a copy.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
