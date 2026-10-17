import type { Metadata } from 'next'
import { NotFoundBody } from '@/components/not-found/not-found-body'

export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
  return <NotFoundBody />
}
