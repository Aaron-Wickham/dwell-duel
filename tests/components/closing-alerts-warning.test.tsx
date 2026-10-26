// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClosingAlertsWarning } from '@/components/admin/closing-alerts-warning'

const NOW = Date.parse('2026-09-29T12:00:00Z')

describe('ClosingAlertsWarning', () => {
  it('renders nothing while the schedule is healthy', () => {
    const { container } = render(<ClosingAlertsWarning health={{ stale: false }} now={NOW} isOwner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says it could not check when the health read failed', () => {
    render(<ClosingAlertsWarning health={{ stale: false, unknown: true }} now={NOW} isOwner />)
    expect(screen.getByText(/Couldn’t check whether closing alerts are running/)).toBeInTheDocument()
  })

  it('says how long ago the last run was', () => {
    render(<ClosingAlertsWarning health={{ stale: true, lastRunAt: '2026-09-29T10:00:00Z' }} now={NOW} isOwner />)
    expect(screen.getByText(/Closing alerts last ran 2h ago\./)).toBeInTheDocument()
  })

  it('says when the schedule has never run', () => {
    render(<ClosingAlertsWarning health={{ stale: true, lastRunAt: null }} now={NOW} isOwner />)
    expect(screen.getByText(/Closing alerts haven’t run yet\./)).toBeInTheDocument()
  })

  // ADM-2: only the owner can reach Supabase, so only the owner gets the steps.
  it('gives the owner the Supabase steps', () => {
    render(<ClosingAlertsWarning health={{ stale: true, lastRunAt: null }} now={NOW} isOwner />)
    expect(screen.getByText(/check the closing-alerts job in\s+Supabase/)).toBeInTheDocument()
  })

  it('tells anyone else members aren’t affected, and to tell the owner', () => {
    render(<ClosingAlertsWarning health={{ stale: true, lastRunAt: '2026-09-29T10:00:00Z' }} now={NOW} isOwner={false} />)
    expect(
      screen.getByText('Closing alerts last ran 2h ago. Members aren’t affected and the daily alert still goes out. Tell the owner.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Supabase/)).toBeNull()
  })
})
