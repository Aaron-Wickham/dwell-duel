import { cache } from 'react'
import type { DbClient } from '@/lib/supabase/database'

// supabase/migrations/0040_roles.sql: owner > admin > reviewer > member.
const ROLES = ['owner', 'admin', 'reviewer', 'member'] as const
export type Role = (typeof ROLES)[number]

const RANK: Record<Role, number> = { owner: 3, admin: 2, reviewer: 1, member: 0 }

export const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', admin: 'Admin', reviewer: 'Reviewer', member: 'Member' }

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min]
}

// Where Admin opens: the section with work waiting (#385), task submissions first, else the first
// section the role can see. Reviewers only see the approval queue; everyone above them starts on
// invites. `waiting` is getReviewCounts', whose market count is always 0 below admin.
export function adminHref(role: Role, waiting: { tasks: number; markets: number } = { tasks: 0, markets: 0 }): string | null {
  if (!atLeast(role, 'reviewer')) return null
  if (waiting.tasks > 0) return '/admin/tasks'
  if (!atLeast(role, 'admin')) return '/admin/tasks'
  return waiting.markets > 0 ? '/admin/markets' : '/admin/invites'
}

// Throws on an RPC error rather than reporting 'member': an Auth or database outage isn't a
// demotion, and treating it as one would hide the error page behind a quiet redirect.
export const getRole = cache(async (supabase: DbClient): Promise<Role> => {
  const { data, error } = await supabase.rpc('my_role')
  if (error) throw error
  return isRole(data) ? data : 'member'
})
