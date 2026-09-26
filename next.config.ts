import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    useOffline: true,
  },
  // Next has no built-in way to read a deployment id from client code (deploymentId itself only
  // affects asset URLs and headers Next sets internally), so the per-deploy id is threaded
  // through as its own build-time env var. ServiceWorkerRegistration appends it to /sw.js's
  // registration URL, which is what makes each deploy install its own worker and cache.
  env: {
    NEXT_PUBLIC_SW_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'local',
  },
  // A service worker only updates when the browser sees new bytes at /sw.js, so neither the
  // browser nor Vercel's CDN may keep a copy.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
