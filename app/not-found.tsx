import type { Metadata } from 'next'
import { NotFoundBody } from '@/components/not-found/not-found-body'

export const metadata: Metadata = { title: 'Page not found' }

// An unmatched URL renders here, outside the signed-in layout and its main landmark.
export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <NotFoundBody />
    </main>
  )
}
