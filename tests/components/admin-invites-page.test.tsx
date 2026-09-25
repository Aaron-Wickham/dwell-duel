// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn(async () => ({ supabase: {}, user: { id: 'u1' } })) }))
vi.mock('@/lib/auth/is-admin', () => ({ isAdmin: vi.fn(async () => true) }))
vi.mock('@/lib/invites/list-invites', () => ({ listInvites: vi.fn(async () => []) }))
vi.mock('@/lib/invites/actions', () => ({ addInviteAction: vi.fn(), revokeInviteAction: vi.fn() }))

import AdminInvitesPage from '@/app/(app)/admin/invites/page'

describe('AdminInvitesPage', () => {
  it('points the empty state at the form beside the list, not "above" it', async () => {
    render(await AdminInvitesPage())
    expect(screen.getByText('Add an email to invite someone.')).toBeInTheDocument()
    expect(screen.queryByText(/above/)).not.toBeInTheDocument()
  })
})
