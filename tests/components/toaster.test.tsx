// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const { toasterProps } = vi.hoisted(() => ({ toasterProps: [] as Record<string, unknown>[] }))
vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => {
    toasterProps.push(props)
    return null
  },
}))

import { Toaster } from '@/components/ui/toaster'

function mockDesktop(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

beforeEach(() => {
  toasterProps.length = 0
})

describe('Toaster', () => {
  it('drops phone toasts below the top bar and, in the installed app, the status band', () => {
    mockDesktop(false)
    render(<Toaster />)
    const props = toasterProps.at(-1)!
    const phoneOffset = { top: 'calc(80px + var(--safe-top))', left: 16, right: 16 }
    expect(props.position).toBe('top-center')
    expect(props.offset).toEqual(phoneOffset)
    expect(props.mobileOffset).toEqual(phoneOffset)
  })

  it('keeps desktop toasts bottom-right', () => {
    mockDesktop(true)
    render(<Toaster />)
    const props = toasterProps.at(-1)!
    expect(props.position).toBe('bottom-right')
    expect(props.offset).toEqual({ bottom: 96, right: 32 })
  })

  // Sonner's rich colours have a light and a dark set, so the toaster follows the theme the root
  // layout and Settings write onto <html>; with no choice saved it follows the device, as the tokens do.
  it('takes its theme from <html>, and follows the device when no theme is saved', () => {
    mockDesktop(false)
    delete document.documentElement.dataset.theme
    render(<Toaster />)
    expect(toasterProps.at(-1)!.theme).toBe('system')

    document.documentElement.dataset.theme = 'dark'
    render(<Toaster />)
    expect(toasterProps.at(-1)!.theme).toBe('dark')
    delete document.documentElement.dataset.theme
  })

  it('re-renders when Settings changes the theme in place', async () => {
    mockDesktop(false)
    document.documentElement.dataset.theme = 'light'
    render(<Toaster />)
    expect(toasterProps.at(-1)!.theme).toBe('light')

    document.documentElement.dataset.theme = 'dark'
    await waitFor(() => expect(toasterProps.at(-1)!.theme).toBe('dark'))
    delete document.documentElement.dataset.theme
  })
})
