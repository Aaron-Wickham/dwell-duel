// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LocalTime } from '@/components/ui/local-time'
import { formatDateTime, formatDay } from '@/lib/markets/format-date'

const iso = '2026-10-04T14:00:00.000Z'

describe('LocalTime', () => {
  it('shows the date and time in the browser time zone, with a machine-readable datetime', () => {
    const { container } = render(<LocalTime iso={iso} format="dateTime" />)
    const time = container.querySelector('time')
    expect(time).toHaveAttribute('datetime', iso)
    expect(time?.textContent).toBe(formatDateTime(iso))
  })

  it('can show just the day', () => {
    const { container } = render(<LocalTime iso={iso} format="day" />)
    expect(container.querySelector('time')?.textContent).toBe(formatDay(iso))
  })
})
