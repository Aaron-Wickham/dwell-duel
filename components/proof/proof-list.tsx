import { FileText, Link2 } from 'lucide-react'
import type { ProofView } from '@/lib/proof/types'

// Attachments past their retention (0077) are gone, so they're counted in a line instead.
// Photos as a thumbnail strip, then documents and links, each opening in a new tab. Signed URLs
// last an hour (lib/proof/signed.ts), long past any time someone keeps a page open to look.
export function ProofList({ proof, label }: { proof: ProofView[]; label: string }) {
  if (proof.length === 0) return null
  const expired = proof.filter((p) => p.expired)
  const live = proof.filter((p) => !p.expired)
  const images = live.filter((p) => p.kind === 'image')
  const others = live.filter((p) => p.kind !== 'image')
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((p) => (
            <li key={p.id}>
              <a
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="pressable block size-16 overflow-hidden rounded-control border border-line no-underline"
                aria-label={`Open photo ${p.label}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.href} alt="" className="size-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="flex flex-col gap-1">
          {others.map((p) => (
            <li key={p.id} className="flex min-w-0 items-center gap-2">
              {p.kind === 'file' ? (
                <FileText aria-hidden="true" className="size-4 shrink-0 text-ink2" />
              ) : (
                <Link2 aria-hidden="true" className="size-4 shrink-0 text-ink2" />
              )}
              <a href={p.href} target="_blank" rel="noopener noreferrer" className="hit-area block min-w-0 text-sm">
                <span className="block truncate">{p.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {expired.length > 0 && (
        <p className="text-sm text-ink2">
          {expired.length === 1 ? '1 attachment has' : `${expired.length} attachments have`} expired and was deleted.
        </p>
      )}
    </div>
  )
}
