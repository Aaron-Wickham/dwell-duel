// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusBand } from '@/components/app-shell/status-band'

describe('StatusBand', () => {
  it('is a decorative teal strip fixed to the top, as tall as the standalone top inset', () => {
    const { container } = render(<StatusBand />)
    const band = container.firstElementChild
    expect(band).toHaveAttribute('aria-hidden', 'true')
    expect(band).toHaveClass('fixed', 'top-0', 'inset-x-0', 'h-(--safe-top)', 'bg-status-band', 'pointer-events-none')
  })
})
