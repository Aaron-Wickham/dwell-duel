import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Leaderboard' }

// Members have no list of their own: the leaderboard is it.
export default function MembersIndex() {
  redirect('/leaderboard')
}
