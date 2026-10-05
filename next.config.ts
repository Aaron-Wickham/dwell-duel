import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'

// Scripts and connections only to DwellDuel itself and its Supabase project; nothing frames the app
// (clickjacking on admin actions). Next's own inline scripts and the launch screen's cold-start
// script need 'unsafe-inline' without a per-request nonce, and dev mode needs 'unsafe-eval'.
// Sign-in leaves for Google by navigation and comes back by Google's own form post, so nothing of
// Google's loads here.
function contentSecurityPolicy(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const realtime = supabase.replace(/^http/, 'ws')
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    // Vercel Analytics and Speed Insights: same-origin in production, va.vercel-scripts.com otherwise.
    `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${dev ? " 'unsafe-eval'" : ''}`,
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

// Next has no built-in way to read a deployment id from client code (deploymentId itself only
// affects asset URLs and headers Next sets internally), so the per-deploy id is threaded
// through as its own build-time env var. ServiceWorkerRegistration appends it to /sw.js's
// registration URL, which is what makes each deploy install its own worker and cache.
// VERCEL_DEPLOYMENT_ID comes first: a redeploy of the same commit (a rollback, a retry) gets a
// new id, where the commit SHA would stay put and leave the old worker in place.
// It's also the Sentry release (sentryOptions), so the source maps below upload under it.
const deployVersion = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'

const nextConfig: NextConfig = {
  // No reason to tell a scanner which framework answers.
  poweredByHeader: false,
  experimental: {
    useOffline: true,
    // A page visited in the last 30s comes back from the client router's cache at once instead of
    // a skeleton (#384), and LiveRefresh then refreshes it in place (a page passes LiveTables its
    // render time). That's the same one render a revisit cost before (#251). An action that
    // revalidates (every money action does) clears the cache.
    staleTimes: {
      dynamic: 30,
    },
  },
  // /how-it-works and /privacy render docs/HOW-IT-WORKS.md, read from disk (lib/docs/how-it-works.ts).
  outputFileTracingIncludes: {
    '/how-it-works/rules': ['./docs/HOW-IT-WORKS.md'],
    '/privacy': ['./docs/HOW-IT-WORKS.md'],
  },
  env: {
    NEXT_PUBLIC_SW_VERSION: deployVersion,
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

// Only a build that holds SENTRY_AUTH_TOKEN (Vercel's) is wrapped, so CI, e2e and local builds stay
// exactly what they were. The plugin uploads hidden source maps and deletes them from the output, so
// production never serves them. It stays errors-only: no build-time instrumentation or navigation
// spans. A Sentry outage mustn't block a deploy, so an upload failure only warns. Vercel builds
// without .git, so commits are named by SHA rather than read from git. The org and project are
// slugs, not secrets; Vercel never had them set, so without these defaults every build skipped the
// upload (#370).
const commit = process.env.VERCEL_GIT_COMMIT_SHA

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG || 'dwellduel',
      project: process.env.SENTRY_PROJECT || 'dwell-duel',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: {
        name: deployVersion,
        setCommits: commit ? { repo: 'Aaron-Wickham/dwell-duel', commit, ignoreMissing: true } : false,
      },
      buildTimeInstrumentation: false,
      suppressOnRouterTransitionStartWarning: true,
      telemetry: false,
      errorHandler: (err) => console.warn('Sentry source map upload failed:', err),
    })
  : nextConfig
