import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-8 bg-acc-soft text-sm text-acc-text',
  md: 'size-10 bg-acc-soft text-acc-text',
  lg: 'size-16 bg-lime text-[26px] text-on-lime md:size-20 md:text-[32px]',
} as const

export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof SIZES }) {
  // Array.from splits by code point, so a name starting with an emoji keeps the whole character.
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?'
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-full font-extrabold', SIZES[size])}
    >
      {initial}
    </span>
  )
}
