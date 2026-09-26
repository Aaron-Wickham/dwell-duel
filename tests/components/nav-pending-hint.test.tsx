// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let pending = false
vi.mock('next/link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/link')>()
  return { ...actual, useLinkStatus: () => ({ pending }) }
})

import Link from 'next/link'
import { NavPendingHint } from '@/components/nav/nav-pending-hint'

beforeEach(() => {
  pending = false
})

describe('NavPendingHint', () => {
  it('stays in the link, hidden from assistive tech, while idle', () => {
    render(
      <Link href="/markets">
        Markets
        <NavPendingHint className="bottom-1 left-3 h-0.5 w-4" />
      </Link>,
    )
    const link = screen.getByRole('link', { name: 'Markets' })
    const hint = link.querySelector('.nav-pending-hint')
    expect(hint).toHaveAttribute('aria-hidden', 'true')
    expect(hint).not.toHaveAttribute('data-pending')
    expect(hint).toHaveClass('absolute', 'bottom-1', 'left-3', 'h-0.5', 'w-4')
    expect(hint).toBeEmptyDOMElement()
  })

  it('marks itself pending while the navigation is in flight', () => {
    pending = true
    render(
      <Link href="/markets">
        Markets
        <NavPendingHint />
      </Link>,
    )
    expect(screen.getByRole('link', { name: 'Markets' }).querySelector('.nav-pending-hint')).toHaveAttribute(
      'data-pending',
      '',
    )
  })
})
