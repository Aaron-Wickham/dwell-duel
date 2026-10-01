// Shared by the cursors whose keys are free text (a display name, an email), which keyset.ts's
// Cursor can't carry: its id must be a plain token, and its values reach the filter unescaped.

// A key can be any text, so the JSON goes through UTF-8 before btoa, which only takes
// single-byte characters. TextDecoder's fatal mode turns a tampered byte sequence into an error.
export function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(raw: string): string {
  const base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

// The parsed JSON array of a cursor, or null for anything that isn't one.
export function decodeTextCursor(raw: string | string[] | undefined | null, maxLength: number): unknown[] | null {
  if (typeof raw !== 'string' || raw.length > maxLength || !/^[A-Za-z0-9_-]+$/.test(raw)) return null
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

// PostgREST reads a double-quoted value up to the next unescaped quote, taking \" and \\ as
// escapes, so any text reaches the query as a literal and never as filter syntax.
export function quote(value: string | number): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
