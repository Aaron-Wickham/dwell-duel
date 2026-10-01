// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProofPicker } from '@/components/proof/proof-picker'
import { PROOF_MAX_FILES, PROOF_MAX_ITEMS, type ProofDraft } from '@/lib/proof/types'

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
  beforeAll(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

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

  it('stops at 3 photos or files, disabling both buttons but still taking links', async () => {
    render(<Picker />)
    const photos = [1, 2, 3].map((n) => new File(['x'], `${n}.jpg`, { type: 'image/jpeg' }))
    await userEvent.upload(screen.getByLabelText('Add photos'), photos)
    expect(PROOF_MAX_FILES).toBe(3)
    expect(screen.getByLabelText('Add file')).toBeDisabled()
    expect(screen.getByLabelText('Add photos')).toBeDisabled()
    expect(screen.getByLabelText('Link')).toBeEnabled()
  })

  it('trims an over-long pick to the room left and says why', async () => {
    render(<Picker />)
    const photos = [1, 2, 3, 4].map((n) => new File(['x'], `${n}.jpg`, { type: 'image/jpeg' }))
    await userEvent.upload(screen.getByLabelText('Add photos'), photos)
    expect(screen.getByText('Add at most 3 photos or files.')).toBeInTheDocument()
    expect(screen.queryByText('4.jpg')).toBeNull()
  })

  it('refuses a Word document and a file over 3 MB', async () => {
    render(<Picker />)
    const input = screen.getByLabelText('Add file')
    await userEvent.upload(input, new File(['x'], 'notes.doc', { type: 'application/msword' }), { applyAccept: false })
    expect(screen.getByText('notes.doc isn’t a PDF or text file.')).toBeInTheDocument()
    await userEvent.upload(input, new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' }))
    expect(screen.getByText('big.pdf is over 3 MB.')).toBeInTheDocument()
  })
})
