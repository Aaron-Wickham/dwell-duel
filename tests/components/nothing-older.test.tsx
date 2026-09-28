// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

vi.mock('next/link', () => ({
  default: ({ href, scroll, replace, ...props }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean }) => (
    <a href={href} data-scroll={String(scroll ?? true)} data-replace={String(replace ?? false)} {...props} />
  ),
}))

import { NothingOlder } from '@/components/ui/nothing-older'

describe('NothingOlder', () => {
  it('says there is nothing older, with a way back to the newest rows', () => {
    render(<NothingOlder href="/admin/ledger" />)
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    const back = screen.getByRole('link', { name: 'Back to newest' })
    expect(back).toHaveAttribute('href', '/admin/ledger')
    expect(back).toHaveAttribute('data-replace', 'true')
    expect(back).toHaveClass('min-h-11', 'no-underline')
  })
})
