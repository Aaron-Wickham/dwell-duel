'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, ImagePlus, Link2, Paperclip, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { Message } from '@/components/ui/message'
import { linkProblem } from '@/lib/proof/pending-link'
import { PROOF_FILE_ACCEPT, PROOF_FILE_TYPES, PROOF_IMAGE_ACCEPT, PROOF_MAX_BYTES, PROOF_MAX_FILES, PROOF_MAX_ITEMS, type ProofDraft } from '@/lib/proof/types'
import { cn } from '@/lib/utils'

// The labels stand in for their hidden file inputs, so they take the input's focus ring and, once
// nothing more can be attached, the disabled look a button would have.
const attachClass = cn(
  buttonVariants({ variant: 'secondary', size: 'sm' }),
  'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
  'peer-disabled:cursor-not-allowed peer-disabled:border-transparent peer-disabled:bg-sunk peer-disabled:text-ink2',
)

const ADD_PHOTOS = 'add-photos'

// Photos, a document and links, chosen before submitting; nothing uploads until the parent's
// action runs (lib/proof/upload.ts). Controlled, so the parent owns what's attached. A parent that
// sends a link still in the field (withPendingLink) also owns the field's text, through `link` and
// `onLinkChange`, and says through `linkError` why it couldn't send it.
export function ProofPicker({
  id,
  value,
  onChange,
  describedBy,
  link: linkProp,
  onLinkChange,
  linkError = null,
}: {
  id: string
  value: ProofDraft[]
  onChange: (next: ProofDraft[]) => void
  describedBy?: string
  link?: string
  onLinkChange?: (link: string) => void
  linkError?: string | null
}) {
  const [ownLink, setOwnLink] = useState('')
  const link = linkProp ?? ownLink
  const setLink = onLinkChange ?? setOwnLink
  const [ownProblem, setProblem] = useState<string | null>(null)
  const problem = linkError ?? ownProblem
  // Only a refused link marks the link field invalid; a file problem belongs to the file buttons.
  const [linkInvalid, setLinkInvalid] = useState(false)
  // Removing an attachment takes its button away, so focus moves to the next one's, else the one
  // before, else Add photos, rather than falling to the page behind the dialog.
  const removeButtons = useRef(new Map<string, HTMLButtonElement>())
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    const target = refocus.current
    if (!target) return
    refocus.current = null
    if (target === ADD_PHOTOS) document.getElementById(`${id}-photos`)?.focus()
    else removeButtons.current.get(target)?.focus()
  }, [value, id])
  const previews = useMemo(
    () => new Map(value.flatMap((d) => (d.kind === 'image' ? [[d.key, URL.createObjectURL(d.file)] as const] : []))),
    [value],
  )
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const problemId = `${id}-problem`
  const room = PROOF_MAX_ITEMS - value.length
  const fileRoom = PROOF_MAX_FILES - value.filter((d) => d.kind !== 'link').length
  // A problem describes every way of adding proof; the parent's note describes the whole picker.
  const limitId = `${id}-limit`
  // A disabled button says nothing about why, so the limit it reached is a hint beside it.
  const limit =
    room <= 0
      ? `${PROOF_MAX_ITEMS} attachments is the most you can add. Remove one to add another.`
      : fileRoom <= 0
        ? `${PROOF_MAX_FILES} photos or files is the most you can add. You can still add a link.`
        : null
  const describedByAll = [describedBy, limit ? limitId : null, problem ? problemId : null].filter(Boolean).join(' ') || undefined

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
    if (tooBig) return setProblem(`${tooBig.name} is over 3 MB. Pick a smaller file.`)
    if (wrongType) return setProblem(`${wrongType.name} isn’t a PDF or text file. Pick one of those, or use Add photos.`)
    const fits = picked.slice(0, Math.max(0, fileRoom))
    add(fits.map((file) => ({ key: crypto.randomUUID(), kind, file })))
    if (fits.length < picked.length) setProblem(`Add at most ${PROOF_MAX_FILES} photos or files.`)
  }

  function addLink() {
    const url = link.trim()
    const refused = linkProblem(url, value.length)
    if (refused) {
      setLinkInvalid(true)
      return setProblem(refused)
    }
    setLinkInvalid(false)
    add([{ key: crypto.randomUUID(), kind: 'link', url }])
    setLink('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span>
          <input
            id={`${id}-photos`}
            type="file"
            accept={PROOF_IMAGE_ACCEPT}
            multiple
            className="peer sr-only"
            disabled={room <= 0 || fileRoom <= 0}
            aria-describedby={describedByAll}
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
            disabled={room <= 0 || fileRoom <= 0}
            aria-describedby={describedByAll}
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
          maxLength={TEXT_LIMITS.proofLink}
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            setLinkInvalid(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addLink()
            }
          }}
          aria-invalid={linkInvalid || Boolean(linkError) || undefined}
          aria-describedby={describedByAll}
        />
        <Button variant="secondary" size="sm" className="shrink-0" onClick={addLink} disabled={!link.trim() || room <= 0}>
          <Link2 aria-hidden="true" className="size-[18px]" />
          Add link
        </Button>
      </div>
      {limit && (
        <p id={limitId} className="text-sm text-ink2">
          {limit}
        </p>
      )}
      {problem && (
        <Message tone="error" id={problemId}>
          {problem}
        </Message>
      )}
      {value.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Attached proof">
          {value.map((draft, index) => {
            const name = draft.kind === 'link' ? draft.url : draft.file.name
            return (
              <li key={draft.key} className="flex min-h-11 items-center gap-3 rounded-control bg-sunk px-2">
                {draft.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews.get(draft.key)} alt="" width={36} height={36} decoding="async" className="size-9 shrink-0 rounded-segment object-cover" />
                ) : draft.kind === 'file' ? (
                  <FileText aria-hidden="true" className="size-5 shrink-0 text-ink2" />
                ) : (
                  <Link2 aria-hidden="true" className="size-5 shrink-0 text-ink2" />
                )}
                <span className="min-w-0 grow truncate text-sm">{name}</span>
                <Button
                  variant="quiet"
                  size="sm"
                  className="min-w-11 shrink-0 px-2.5"
                  aria-label={`Remove ${name}`}
                  ref={(button) => {
                    if (!button) return
                    removeButtons.current.set(draft.key, button)
                    return () => {
                      removeButtons.current.delete(draft.key)
                    }
                  }}
                  onClick={() => {
                    refocus.current = (value[index + 1] ?? value[index - 1])?.key ?? ADD_PHOTOS
                    onChange(value.filter((d) => d.key !== draft.key))
                  }}
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
