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

// Reviewers only see the approval queue; everyone above them starts on invites.
export function adminHref(role: Role): string | null {
  if (atLeast(role, 'admin')) return '/admin/invites'
  if (atLeast(role, 'reviewer')) return '/admin/tasks'
  return null
}

// Throws on an RPC error rather than reporting 'member': an Auth or database outage isn't a
// demotion, and treating it as one would hide the error page behind a quiet redirect.
export const getRole = cache(async (supabase: DbClient): Promise<Role> => {
  const { data, error } = await supabase.rpc('my_role')
  if (error) throw error
  return isRole(data) ? data : 'member'
})
