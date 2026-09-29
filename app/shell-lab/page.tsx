import type { Metadata } from 'next'
import { ShellLab } from './shell-lab'

// A throwaway test bench for the installed iPhone app's viewport (#127, #128): it measures what the
// phone reports and lets several bottom-bar strategies be tried side by side. Public and unindexed,
// and it shows nothing private. Remove it once the shell is fixed.
export const metadata: Metadata = { title: 'Shell lab', robots: { index: false, follow: false } }

export default function ShellLabPage() {
  return <ShellLab />
}
