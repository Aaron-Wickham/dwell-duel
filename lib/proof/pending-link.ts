import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { isWebLink, PROOF_MAX_ITEMS, type ProofDraft } from './types'

export const PENDING_LINK_PROBLEM = 'Add the link or clear it before sending.'

// Why a link can't be attached beside `attached` others, or null when it can.
export function linkProblem(url: string, attached: number): string | null {
  if (!isWebLink(url)) return 'Links must start with http:// or https://.'
  if (url.length > TEXT_LIMITS.proofLink) return tooLong('Link', TEXT_LIMITS.proofLink)
  if (attached >= PROOF_MAX_ITEMS) return `Add at most ${PROOF_MAX_ITEMS} attachments.`
  return null
}

// A link typed but never added with "Add link" is still what the member means to send (TSK-2): a
// good one goes with the rest, and one that can't go stops the submit rather than vanishing.
export function withPendingLink(drafts: ProofDraft[], text: string): { drafts: ProofDraft[] } | { problem: string } {
  const url = text.trim()
  if (!url) return { drafts }
  if (linkProblem(url, drafts.length)) return { problem: PENDING_LINK_PROBLEM }
  return { drafts: [...drafts, { key: crypto.randomUUID(), kind: 'link', url }] }
}
