import { chipTextClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'

const YES = /^(yes|over)$/i
const NO = /^(no|under)$/i

// The outcome a bet is on (#438): Yes and Over green, No and Under red, any other outcome neutral
// (its name may itself be a colour, "Blue", which no tint should contradict). The word is always
// there, so colour is never the only signal.
export function PickChip({ label, className }: { label: string; className?: string }) {
  const tone = YES.test(label) ? 'bg-acc-soft text-acc-text' : NO.test(label) ? 'bg-loss-soft text-loss' : 'bg-sunk text-ink'
  return (
    <span className={cn(`inline-flex h-6 max-w-full items-center rounded-full px-2 align-middle ${chipTextClass} font-extrabold`, tone, className)}>
      <span className="truncate">{label}</span>
    </span>
  )
}
