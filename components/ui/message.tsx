import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Gold marks static notes like "Awaiting resolution", not news, so it is not a live region.
const TONES = {
  error: { className: 'bg-loss-soft text-loss', Icon: CircleAlert, role: 'alert' },
  ok: { className: 'bg-acc-soft text-acc-text', Icon: CircleCheck, role: 'status' },
  gold: { className: 'bg-gold-soft text-gold', Icon: Info, role: undefined },
} as const

export function Message({
  tone,
  id,
  className,
  children,
}: {
  tone: keyof typeof TONES
  id?: string
  className?: string
  children: ReactNode
}) {
  const { className: toneClass, Icon, role } = TONES[tone]
  return (
    <p
      id={id}
      role={role}
      className={cn('flex items-start gap-2.5 rounded-control px-3.5 py-3 text-[15px] font-bold leading-[1.4]', toneClass, className)}
    >
      <Icon aria-hidden="true" className="mt-px size-5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
