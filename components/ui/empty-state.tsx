import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="flex size-12 items-center justify-center rounded-full bg-sunk text-ink2">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <p className="font-extrabold">{title}</p>
      {children && <p className="text-sm text-ink2">{children}</p>}
      {action}
    </div>
  )
}
