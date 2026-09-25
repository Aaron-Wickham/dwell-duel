import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 self-start font-bold hover:decoration-[3px]">
      <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
      {children}
    </Link>
  )
}
