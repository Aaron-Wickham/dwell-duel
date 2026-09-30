export const STALE_CHUNK_RELOAD_KEY = 'dwellduel:stale-chunk-reload'
// Long enough that a reload which lands on the same error can't chain into another; short enough
// that the next deploy the tab outlives gets its own reload.
export const STALE_CHUNK_RELOAD_COOLDOWN_MS = 60_000

// Webpack's own error name, plus the messages browsers give a failed dynamic import() of a
// module chunk (Chrome, Firefox, Safari) and Next's app-router wording.
const CHUNK_MESSAGES = /Loading chunk [^ ]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load chunk/i

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || CHUNK_MESSAGES.test(error.message)
}

// Reloads the page for a stale-chunk error, at most once per cooldown, remembered in sessionStorage
// so a reload that hits the same error shows the error card instead of reloading again. Returns
// whether a reload was started. Storage and the reload itself are parameters for tests.
export function reloadOnceForStaleChunk(
  error: unknown,
  {
    now = Date.now(),
    storage = typeof sessionStorage === 'undefined' ? null : sessionStorage,
    reload = () => window.location.reload(),
  }: { now?: number; storage?: Pick<Storage, 'getItem' | 'setItem'> | null; reload?: () => void } = {},
): boolean {
  if (!isChunkLoadError(error) || !storage) return false
  try {
    const last = Number(storage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0)
    if (last > 0 && now - last < STALE_CHUNK_RELOAD_COOLDOWN_MS) return false
    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now))
  } catch {
    // Storage unavailable (private mode, blocked): with no way to stop a loop, don't start one.
    return false
  }
  reload()
  return true
}
