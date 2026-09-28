'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileText, ImagePlus, Link2, Paperclip, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { isWebLink, PROOF_FILE_ACCEPT, PROOF_FILE_TYPES, PROOF_MAX_BYTES, PROOF_MAX_ITEMS, type ProofDraft } from '@/lib/proof/types'
import { cn } from '@/lib/utils'

const attachClass = cn(
  buttonVariants({ variant: 'secondary', size: 'sm' }),
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
)

// Photos, a document and links, chosen before submitting; nothing uploads until the parent's
// action runs (lib/proof/upload.ts). Controlled, so the parent owns what's attached.
export function ProofPicker({
  id,
  value,
  onChange,
  describedBy,
}: {
  id: string
  value: ProofDraft[]
  onChange: (next: ProofDraft[]) => void
  describedBy?: string
}) {
  const [link, setLink] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const previews = useMemo(
    () => new Map(value.flatMap((d) => (d.kind === 'image' ? [[d.key, URL.createObjectURL(d.file)] as const] : []))),
    [value],
  )
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const problemId = `${id}-problem`
  const room = PROOF_MAX_ITEMS - value.length

  function add(drafts: ProofDraft[]) {
    if (drafts.length > room) {
      setProblem(`Add at most ${PROOF_MAX_ITEMS} attachments.`)
      drafts = drafts.slice(0, Math.max(0, room))
    } else setProblem(null)
    if (drafts.length) onChange([...value, ...drafts])
  }

  function addFiles(files: FileList | null, kind: 'image' | 'file') {
    const picked = Array.from(files ?? [])
    const tooBig = picked.find((f) => kind === 'file' && f.size > PROOF_MAX_BYTES)
    const wrongType = picked.find((f) => kind === 'file' && !PROOF_FILE_TYPES.includes(f.type))
    if (tooBig) return setProblem(`${tooBig.name} is over 10 MB.`)
    if (wrongType) return setProblem(`${wrongType.name} isn’t a PDF, Word or text file.`)
    add(picked.map((file) => ({ key: crypto.randomUUID(), kind, file })))
  }

  function addLink() {
    const url = link.trim()
    if (!isWebLink(url)) return setProblem('Links must start with http:// or https://.')
    add([{ key: crypto.randomUUID(), kind: 'link', url }])
    setLink('')
  }

  return (
    <div className="flex flex-col gap-3" aria-describedby={describedBy}>
      <div className="flex flex-wrap gap-2">
        <span>
          <input
            id={`${id}-photos`}
            type="file"
            accept="image/*"
            multiple
            className="peer sr-only"
            disabled={room <= 0}
            onChange={(e) => {
              addFiles(e.target.files, 'image')
              e.target.value = ''
            }}
          />
          <label htmlFor={`${id}-photos`} className={attachClass}>
            <ImagePlus aria-hidden="true" className="size-[18px]" />
            Add photos
          </label>
        </span>
        <span>
          <input
            id={`${id}-file`}
            type="file"
            accept={PROOF_FILE_ACCEPT}
            className="peer sr-only"
            disabled={room <= 0}
            onChange={(e) => {
              addFiles(e.target.files, 'file')
              e.target.value = ''
            }}
          />
          <label htmlFor={`${id}-file`} className={attachClass}>
            <Paperclip aria-hidden="true" className="size-[18px]" />
            Add file
          </label>
        </span>
      </div>
      <div className="flex gap-2">
        <label htmlFor={`${id}-link`} className="sr-only">
          Link
        </label>
        <Input
          id={`${id}-link`}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addLink()
            }
          }}
          aria-describedby={problem ? problemId : undefined}
        />
        <Button variant="secondary" size="sm" className="shrink-0" onClick={addLink} disabled={!link.trim() || room <= 0}>
          <Link2 aria-hidden="true" className="size-[18px]" />
          Add link
        </Button>
      </div>
      {problem && (
        <Message tone="error" id={problemId}>
          {problem}
        </Message>
      )}
      {value.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Attached proof">
          {value.map((draft) => {
            const name = draft.kind === 'link' ? draft.url : draft.file.name
            return (
              <li key={draft.key} className="flex min-h-11 items-center gap-3 rounded-control bg-sunk px-2">
                {draft.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews.get(draft.key)} alt="" className="size-9 shrink-0 rounded-[8px] object-cover" />
                ) : draft.kind === 'file' ? (
                  <FileText aria-hidden="true" className="size-5 shrink-0 text-ink2" />
                ) : (
                  <Link2 aria-hidden="true" className="size-5 shrink-0 text-ink2" />
                )}
                <span className="min-w-0 grow truncate text-sm">{name}</span>
                <Button
                  variant="quiet"
                  size="sm"
                  className="shrink-0 px-2.5"
                  aria-label={`Remove ${name}`}
                  onClick={() => onChange(value.filter((d) => d.key !== draft.key))}
                >
                  <X aria-hidden="true" className="size-5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
