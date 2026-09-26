const APP_SECTIONS = new Set(['markets', 'parlays', 'tasks', 'feed', 'leaderboard', 'members', 'admin'])

// The signed-in routes under app/(app)/. Everything else (sign-in, the auth callback,
// not-invited, the cron route, the manifest, the service worker, offline) stays public.
export function isAppPath(pathname: string): boolean {
  if (pathname === '/') return true
  return APP_SECTIONS.has(pathname.split('/')[1] ?? '')
}
