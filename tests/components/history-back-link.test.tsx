// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { back, useNavDepth } = vi.hoisted(() => ({ back: vi.fn(), useNavDepth: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/members/p-alice', useRouter: () => ({ back }) }))
vi.mock('@/lib/nav/nav-depth', () => ({ useNavDepth }))

import { HistoryBackLink } from '@/components/ui/history-back-link'

beforeEach(() => {
  back.mockReset()
  useNavDepth.mockReset()
})

describe('HistoryBackLink', () => {
  it('says Back and links to the logical parent, for a deep link or before hydration', () => {
    useNavDepth.mockReturnValue(0)
    render(<HistoryBackLink />)
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/leaderboard')
  })

  it('goes back through history when the member navigated here in the app', async () => {
    useNavDepth.mockReturnValue(2)
    render(<HistoryBackLink />)
    await userEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(back).toHaveBeenCalledOnce()
  })
})
