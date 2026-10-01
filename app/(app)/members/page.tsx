import { redirect } from 'next/navigation'

// Members have no list of their own: the leaderboard is it.
export default function MembersIndex() {
  redirect('/leaderboard')
}
