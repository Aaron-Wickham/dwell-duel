// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProofPicker } from '@/components/proof/proof-picker'
import { PROOF_MAX_ITEMS, type ProofDraft } from '@/lib/proof/types'

function Picker({ initial = [], describedBy }: { initial?: ProofDraft[]; describedBy?: string }) {
  const [value, setValue] = useState<ProofDraft[]>(initial)
  return (
    <>
      <p id="proof-note">Only reviewers see it.</p>
      <ProofPicker id="proof" value={value} onChange={setValue} describedBy={describedBy} />
    </>
  )
}

const links = (n: number): ProofDraft[] =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, kind: 'link', url: `https://example.com/${i}` }))

describe('ProofPicker', () => {
  it('describes each way of adding proof with the parent’s note, on the inputs rather than a wrapper', () => {
    render(<Picker describedBy="proof-note" />)
    for (const input of [screen.getByLabelText('Add photos'), screen.getByLabelText('Add file'), screen.getByLabelText('Link')]) {
      expect(input).toHaveAccessibleDescription('Only reviewers see it.')
    }
  })

  it('marks the link field invalid for a refused link, and clears it once the link changes', async () => {
    render(<Picker describedBy="proof-note" />)
    const link = screen.getByLabelText('Link')
    await userEvent.type(link, 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))

    expect(link).toHaveAttribute('aria-invalid', 'true')
    expect(link).toHaveAccessibleDescription('Only reviewers see it. Links must start with http:// or https://.')

    await userEvent.type(link, 'x')
    expect(link).not.toHaveAttribute('aria-invalid')
  })

  it('shows the file buttons as disabled, and keeps the link field described, once nothing more fits', () => {
    render(<Picker initial={links(PROOF_MAX_ITEMS)} />)
    for (const name of ['Add photos', 'Add file']) {
      const input = screen.getByLabelText(name)
      expect(input).toBeDisabled()
      const label = document.querySelector(`label[for="${input.id}"]`)
      expect(label).toHaveClass('peer-disabled:bg-sunk', 'peer-disabled:text-ink2', 'peer-focus-visible:outline-3')
    }
    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled()
  })

  it('gives every Remove button a 44px target and removes just that attachment', async () => {
    render(<Picker initial={links(2)} />)
    const remove = screen.getByRole('button', { name: 'Remove https://example.com/0' })
    expect(remove).toHaveClass('min-w-11', 'min-h-11')
    await userEvent.click(remove)
    expect(screen.queryByText('https://example.com/0')).toBeNull()
    expect(screen.getByText('https://example.com/1')).toBeInTheDocument()
  })
})
