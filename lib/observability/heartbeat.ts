// healthchecks.io-style dead-man's switch. The URL is optional: unset, nothing is pinged. A ping
// that fails must never fail the job it reports on, so this swallows its own errors.
export async function pingHeartbeat(
  url: string | undefined,
  ok: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!url) return false
  try {
    const res = await fetchImpl(ok ? url : `${url.replace(/\/+$/, '')}/fail`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch (error) {
    console.error('Heartbeat ping failed', error)
    return false
  }
}
