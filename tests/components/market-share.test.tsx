// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

import { ManualShareLink, marketShareUrl, useMarketShare } from '@/app/(app)/markets/[id]/market-share'

const ID = '11111111-1111-4111-8111-111111111111'

// The market's "More actions" menu calls share() from its Share item and renders the manual link.
function ShareHarness() {
  const { share, manualUrl } = useMarketShare(ID, 'Will it rain?')
  return (
    <>
      <button type="button" onClick={share}>
        Share
      </button>
      {manualUrl && <ManualShareLink url={manualUrl} />}
    </>
  )
}
const URL_ON_LOCALHOST = `${window.location.origin}/markets/${ID}`

function setNavigator(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
}

beforeEach(() => success.mockReset())

afterEach(() => {
  setNavigator('share', undefined)
  setNavigator('clipboard', undefined)
  vi.restoreAllMocks()
  document.execCommand = undefined as unknown as typeof document.execCommand
})

// userEvent.setup() installs its own clipboard, so each test sets the navigator it wants after it.
function clickShare() {
  const user = userEvent.setup()
  return { user, click: () => user.click(screen.getByRole('button', { name: 'Share' })) }
}

describe('marketShareUrl', () => {
  it('points the bare domain at www', () => {
    expect(marketShareUrl('https://dwellduel.com', ID)).toBe(`https://www.dwellduel.com/markets/${ID}`)
  })

  it('keeps www, preview subdomains and localhost as they are', () => {
    expect(marketShareUrl('https://www.dwellduel.com', ID)).toBe(`https://www.dwellduel.com/markets/${ID}`)
    expect(marketShareUrl('https://dwell-duel-git-x.vercel.app', ID)).toBe(`https://dwell-duel-git-x.vercel.app/markets/${ID}`)
    expect(marketShareUrl('http://localhost:3000', ID)).toBe(`http://localhost:3000/markets/${ID}`)
  })
})

describe('useMarketShare', () => {
  it('uses the share sheet when there is one', async () => {
    render(<ShareHarness />)
    const { click } = clickShare()
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    setNavigator('share', share)
    setNavigator('clipboard', { writeText })

    await click()
    expect(share).toHaveBeenCalledWith({ title: 'Will it rain?', url: URL_ON_LOCALHOST })
    expect(writeText).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('treats a cancelled share as nothing to report', async () => {
    render(<ShareHarness />)
    const { click } = clickShare()
    const writeText = vi.fn()
    setNavigator('share', vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError')))
    setNavigator('clipboard', { writeText })

    await click()
    expect(writeText).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('copies the link and toasts when there is no share sheet', async () => {
    render(<ShareHarness />)
    const { click } = clickShare()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator('clipboard', { writeText })

    await click()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Link copied.'))
    expect(writeText).toHaveBeenCalledWith(URL_ON_LOCALHOST)
  })

  it('copies when sharing fails for another reason', async () => {
    render(<ShareHarness />)
    const { click } = clickShare()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator('share', vi.fn().mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError')))
    setNavigator('clipboard', { writeText })

    await click()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Link copied.'))
  })

  it('falls back to a hidden textarea when there is no Clipboard API', async () => {
    render(<ShareHarness />)
    const { click } = clickShare()
    setNavigator('clipboard', undefined)
    let copied = ''
    document.execCommand = vi.fn(() => {
      copied = document.querySelector('textarea')?.value ?? ''
      return true
    })

    await click()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Link copied.'))
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(copied).toBe(URL_ON_LOCALHOST)
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('shows the link to copy by hand when nothing else works', async () => {
    render(<ShareHarness />)
    const { click } = clickShare()
    setNavigator('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    document.execCommand = vi.fn(() => false)

    await click()
    const field = await screen.findByLabelText('Copy this link to share the market')
    expect(field).toHaveValue(URL_ON_LOCALHOST)
    expect(success).not.toHaveBeenCalled()
  })
})
