import { chipTextClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'

// The outcome a bet is on. Every outcome takes the same neutral chip (D-3): Yes and No are sides of
// a question, not good and bad, red already means a lost bet, and an outcome's name may itself be a
// colour ("Blue"). The word says which side; a result keeps its win or loss colour elsewhere.
export function PickChip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn(`inline-flex h-6 max-w-full items-center rounded-full bg-sunk px-2 align-middle ${chipTextClass} font-extrabold text-ink`, className)}>
      <span className="truncate">{label}</span>
    </span>
  )
}
