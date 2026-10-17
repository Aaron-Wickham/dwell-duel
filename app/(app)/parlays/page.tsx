import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'My bets' }

// Parlays moved into My bets beside solo bets (#34). Old links and home-screen shortcuts still land.
export default function ParlaysPage() {
  redirect('/bets')
}
