// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { voidMarketAction } = vi.hoisted(() => ({ voidMarketAction: vi.fn() }))
vi.mock('@/lib/markets/void-market', () => ({ voidMarketAction }))

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

import { VoidButton } from '@/app/(app)/markets/[id]/void-button'

beforeEach(() => {
  voidMarketAction.mockReset()
  success.mockReset()
})

describe('VoidButton', () => {
  it('describes itself by the hint alone before any error', () => {
    render(<VoidButton marketId="m1" />)
    expect(screen.getByRole('button', { name: 'Void this market' })).toHaveAttribute('aria-describedby', 'void-hint')
  })

  it('adds the error id alongside the hint once voiding fails', async () => {
    voidMarketAction.mockResolvedValue({ formError: 'Could not void that market.' })
    render(<VoidButton marketId="m1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not void that market.')
    expect(screen.getByRole('button', { name: 'Void this market' })).toHaveAttribute('aria-describedby', 'void-hint void-error')
  })

  it('toasts once voiding succeeds', async () => {
    voidMarketAction.mockResolvedValue(undefined)
    render(<VoidButton marketId="m1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))

    await waitFor(() => expect(success).toHaveBeenCalledWith('Market voided.'))
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('does not toast when voiding fails', async () => {
    voidMarketAction.mockResolvedValue({ formError: 'Could not void that market.' })
    render(<VoidButton marketId="m1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))
    await screen.findByRole('alert')

    expect(success).not.toHaveBeenCalled()
  })
})
