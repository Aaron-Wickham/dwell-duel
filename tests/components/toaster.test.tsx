// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

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
    expect(props.offset).toEqual({ bottom: 24, right: 24 })
  })
})
