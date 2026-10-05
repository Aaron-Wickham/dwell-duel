// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useOffline, toast } = vi.hoisted(() => ({
  useOffline: vi.fn(),
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
}))
vi.mock('next/offline', () => ({ useOffline }))
vi.mock('sonner', () => ({ toast }))

import { OFFLINE_NAV_COPY, OfflineNavNotice } from '@/components/offline/offline-nav-notice'

function page() {
  return (
    <>
      <OfflineNavNotice />
      {/* Stands in for next/link, which takes the click over before it reaches the document. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/tasks" onClick={(e) => e.preventDefault()}>
        Tasks
      </a>
      <a href="https://example.com/" onClick={(e) => e.preventDefault()}>
        Elsewhere
      </a>
    </>
  )
}

beforeEach(() => {
  useOffline.mockReset()
  toast.mockReset()
  toast.dismiss.mockReset()
})

describe('OfflineNavNotice (ST-7)', () => {
  it('answers a tap on an in-app link at once while offline', async () => {
    useOffline.mockReturnValue(true)
    render(page())
    await userEvent.click(screen.getByRole('link', { name: 'Tasks' }))
    expect(toast).toHaveBeenCalledExactlyOnceWith(OFFLINE_NAV_COPY, { id: 'offline-nav' })
  })

  it('stays quiet online, and for a link that leaves the site', async () => {
    useOffline.mockReturnValue(false)
    const { rerender } = render(page())
    await userEvent.click(screen.getByRole('link', { name: 'Tasks' }))
    expect(toast).not.toHaveBeenCalled()

    useOffline.mockReturnValue(true)
    rerender(page())
    await userEvent.click(screen.getByRole('link', { name: 'Elsewhere' }))
    expect(toast).not.toHaveBeenCalled()
  })

  it('clears the notice when the connection returns', () => {
    useOffline.mockReturnValue(true)
    const { rerender } = render(page())
    useOffline.mockReturnValue(false)
    rerender(page())
    expect(toast.dismiss).toHaveBeenCalledWith('offline-nav')
  })
})
