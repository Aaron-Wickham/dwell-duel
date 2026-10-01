import { notFound } from 'next/navigation'

// An unmatched URL otherwise falls to the root not-found page, which has no app shell. Matching it
// here renders (app)/not-found.tsx inside the signed-in layout, nav and tab bar included.
export default function Missing() {
  notFound()
}
