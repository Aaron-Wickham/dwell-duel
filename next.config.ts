import type { NextConfig } from 'next'

// Scripts and connections only to DwellDuel itself and its Supabase project; nothing frames the app
// (clickjacking on admin actions). Next's own inline scripts and the launch screen's cold-start
// script need 'unsafe-inline' without a per-request nonce, and dev mode needs 'unsafe-eval'.
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const realtime = supabase.replace(/^http/, 'ws')
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    // Vercel Analytics and Speed Insights: same-origin in production, va.vercel-scripts.com otherwise.
    `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${realtime}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const nextConfig: NextConfig = {
  experimental: {
    useOffline: true,
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
