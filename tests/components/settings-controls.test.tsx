// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setThemeAction = vi.fn(async (_value: string) => {})
const setHapticsAction = vi.fn(async (_on: boolean) => {})
const setReduceMotionAction = vi.fn(async (_on: boolean) => {})
vi.mock('@/lib/theme/set-theme', () => ({ setThemeAction: (v: string) => setThemeAction(v) }))
vi.mock('@/lib/preferences/set-preference', () => ({
  setHapticsAction: (on: boolean) => setHapticsAction(on),
  setReduceMotionAction: (on: boolean) => setReduceMotionAction(on),
}))

import { MotionSettings, ThemeSetting } from '@/app/(app)/settings/settings-controls'

function stubDeviceReducesMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
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
  for (const fn of [setThemeAction, setHapticsAction, setReduceMotionAction]) fn.mockClear()
  for (const key of ['theme', 'haptics', 'motion']) delete document.documentElement.dataset[key]
  stubDeviceReducesMotion(false)
})

describe('ThemeSetting', () => {
  it('offers System, Light and Dark as one radio group, with the saved choice checked', () => {
    render(<ThemeSetting initial="light" />)
    const group = screen.getByRole('group', { name: 'Theme' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['system', 'light', 'dark'])
    expect(screen.getByLabelText('Light')).toBeChecked()
  })

  it('applies a theme straight away and saves it, and System clears it', async () => {
    render(<ThemeSetting initial="system" />)
    await userEvent.click(screen.getByLabelText('Dark'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(setThemeAction).toHaveBeenLastCalledWith('dark')

    await userEvent.click(screen.getByLabelText('System'))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(setThemeAction).toHaveBeenLastCalledWith('system')
  })

  it('puts the old theme back and says so when saving fails', async () => {
    setThemeAction.mockRejectedValueOnce(new Error('offline'))
    render(<ThemeSetting initial="system" />)
    await userEvent.click(screen.getByLabelText('Dark'))
    await waitFor(() => expect(screen.getByLabelText('System')).toBeChecked())
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(screen.getByText(/Couldn’t save that setting/)).toBeInTheDocument()
  })
})

describe('MotionSettings', () => {
  it('turns vibration off and on, on the page and in the cookie', async () => {
    render(<MotionSettings haptics reduceMotion={false} />)
    const toggle = screen.getByRole('checkbox', { name: 'Vibrate on taps' })
    expect(toggle).toBeChecked()
    await userEvent.click(toggle)
    expect(document.documentElement.dataset.haptics).toBe('off')
    expect(setHapticsAction).toHaveBeenLastCalledWith(false)
    await userEvent.click(toggle)
    expect(document.documentElement.dataset.haptics).toBeUndefined()
    expect(setHapticsAction).toHaveBeenLastCalledWith(true)
  })

  it('reduces animations on the page and saves it', async () => {
    render(<MotionSettings haptics reduceMotion={false} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Reduce animations' }))
    expect(document.documentElement.dataset.motion).toBe('reduce')
    expect(setReduceMotionAction).toHaveBeenLastCalledWith(true)
  })

  it('shows animations as already reduced, and locked, when the device reduces motion', () => {
    stubDeviceReducesMotion(true)
    render(<MotionSettings haptics reduceMotion={false} />)
    const toggle = screen.getByRole('checkbox', { name: 'Reduce animations' })
    expect(toggle).toBeChecked()
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAccessibleDescription('Your device is set to reduce motion, so animations are already off.')
  })
})
