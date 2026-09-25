// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setThemeAction = vi.fn(async (_value: string) => {})
vi.mock('@/lib/theme/set-theme', () => ({ setThemeAction: (value: string) => setThemeAction(value) }))

import { ThemeToggle } from '@/components/app-nav/theme-toggle'

function stubSystemDark(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  setThemeAction.mockClear()
  delete document.documentElement.dataset.theme
})

describe('ThemeToggle', () => {
  it('switches from the light system theme to dark, and saves it', async () => {
    stubSystemDark(false)
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(setThemeAction).toHaveBeenCalledWith('dark')
  })

  it('switches from the dark system theme to light', async () => {
    stubSystemDark(true)
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(setThemeAction).toHaveBeenCalledWith('light')
  })

  it('switches away from a saved choice, whatever the system says', async () => {
    stubSystemDark(false)
    document.documentElement.dataset.theme = 'dark'
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(setThemeAction).toHaveBeenCalledWith('light')
  })

  it('reverts the DOM if saving the theme fails', async () => {
    stubSystemDark(false)
    setThemeAction.mockRejectedValueOnce(new Error('network error'))
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBeUndefined())
  })
})
