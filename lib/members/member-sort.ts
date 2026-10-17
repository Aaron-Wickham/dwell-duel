import type { SearchParams } from '@/lib/pagination/cursor'

// Admin › Members' orders (#418): A–Z by default, or by a figure in either direction, on both tabs.
export const MEMBER_SORTS = ['name', 'balance', 'net_worth', 'joined'] as const
export type MemberSort = (typeof MEMBER_SORTS)[number]
export type SortDir = 'asc' | 'desc'
export type MemberOrder = { sort: MemberSort; dir: SortDir }

// The direction a column sorts in first: names A–Z, figures highest first, the newest member first.
export const FIRST_DIR: Record<MemberSort, SortDir> = { name: 'asc', balance: 'desc', net_worth: 'desc', joined: 'desc' }

export function readMemberOrder(searchParams: SearchParams): MemberOrder {
  const raw = searchParams.sort
  const sort = MEMBER_SORTS.find((s) => s === raw) ?? 'name'
  if (sort === 'name') return { sort: 'name', dir: 'asc' }
  const dir = searchParams.dir === 'asc' || searchParams.dir === 'desc' ? searchParams.dir : FIRST_DIR[sort]
  return { sort, dir }
}

// What a header's link asks for: the current column turned round, or another column in its first
// direction. Names sort A–Z only.
export function nextOrder(current: MemberOrder, sort: MemberSort): MemberOrder {
  if (sort === 'name') return { sort, dir: 'asc' }
  if (current.sort === sort) return { sort, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { sort, dir: FIRST_DIR[sort] }
}

// The URL params for an order, leaving out the defaults so the plain list keeps its plain URL.
export function orderParams(order: MemberOrder): { sort: string | null; dir: string | null } {
  if (order.sort === 'name') return { sort: null, dir: null }
  return { sort: order.sort, dir: order.dir === FIRST_DIR[order.sort] ? null : order.dir }
}

const LABELS: Record<MemberSort, Record<SortDir, string>> = {
  name: { asc: 'A to Z', desc: 'Z to A' },
  balance: { desc: 'highest balance first', asc: 'lowest balance first' },
  net_worth: { desc: 'highest net worth first', asc: 'lowest net worth first' },
  joined: { desc: 'newest first', asc: 'oldest first' },
}

export function orderLabel(order: MemberOrder): string {
  return LABELS[order.sort][order.dir]
}
