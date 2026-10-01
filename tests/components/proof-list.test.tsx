// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProofList } from '@/components/proof/proof-list'

describe('ProofList', () => {
  it('counts expired attachments in a line and shows the rest', () => {
    render(
      <ProofList
        label="Proof"
        proof={[
          { id: '1', kind: 'image', href: '', label: 'a.webp', expired: true },
          { id: '2', kind: 'file', href: 'https://signed/b', label: 'b.pdf' },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'b.pdf' })).toHaveAttribute('href', 'https://signed/b')
    expect(screen.getByText('1 attachment has expired and been deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /a\.webp/ })).toBeNull()
  })

  it('pluralises the expired line', () => {
    const proof = [1, 2].map((n) => ({ id: String(n), kind: 'image' as const, href: '', label: `${n}.webp`, expired: true }))
    render(<ProofList label="Proof" proof={proof} />)
    expect(screen.getByText('2 attachments have expired and been deleted.')).toBeInTheDocument()
  })
})
