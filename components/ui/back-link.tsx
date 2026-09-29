import type { MouseEventHandler, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function BackLink({
  href,
  onClick,
  children,
}: {
  href: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      transitionTypes={['nav-back']}
      className="pressable inline-flex min-h-11 items-center gap-1.5 self-start font-bold"
    >
      <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
      {children}
    </Link>
  )
}
