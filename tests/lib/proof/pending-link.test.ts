import { describe, it, expect } from 'vitest'
import { PENDING_LINK_PROBLEM, linkProblem, withPendingLink } from '@/lib/proof/pending-link'
import type { ProofDraft } from '@/lib/proof/types'

const links = (n: number): ProofDraft[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, kind: 'link', url: `https://example.com/${i}` }))

describe('linkProblem', () => {
  it('takes a web link with room for it', () => {
    expect(linkProblem('https://example.com', 0)).toBeNull()
  })

  it('refuses a link that isn’t a web address, one too long and one past the limit', () => {
    expect(linkProblem('example.com', 0)).toBe('Links must start with http:// or https://.')
    expect(linkProblem(`https://example.com/${'a'.repeat(3000)}`, 0)).toMatch(/Link/)
    expect(linkProblem('https://example.com', 5)).toBe('Add at most 5 attachments.')
  })
})

describe('withPendingLink', () => {
  it('leaves the drafts alone when the field is empty', () => {
    const drafts = links(1)
    expect(withPendingLink(drafts, '   ')).toEqual({ drafts })
  })

  it('adds a good link still in the field, trimmed', () => {
    const result = withPendingLink(links(1), '  https://example.com/new ')
    expect('drafts' in result && result.drafts.at(-1)).toMatchObject({ kind: 'link', url: 'https://example.com/new' })
  })

  it('asks to add or clear a link that can’t go', () => {
    expect(withPendingLink([], 'example.com')).toEqual({ problem: PENDING_LINK_PROBLEM })
    expect(withPendingLink(links(5), 'https://example.com/6')).toEqual({ problem: PENDING_LINK_PROBLEM })
  })
})
