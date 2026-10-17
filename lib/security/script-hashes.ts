import { createHash } from 'node:crypto'
import { INLINE_SCRIPTS } from '@/lib/app-shell/inline-scripts'

// Hashes rather than the nonce for the app's own scripts: they're constants, and a server
// component's <script nonce> would have to read the request's headers in every layout that draws one.
export function scriptHash(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`
}

export const INLINE_SCRIPT_HASHES: readonly string[] = INLINE_SCRIPTS.map(scriptHash)
