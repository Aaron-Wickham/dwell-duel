import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-8 bg-acc-soft text-sm text-acc-text',
  md: 'size-10 bg-acc-soft text-acc-text',
  nav: 'size-9 bg-acc-soft text-[15px] text-acc-text',
  lg: 'size-16 bg-lime text-[26px] text-on-lime md:size-20 md:text-[32px]',
} as const

// Decorative either way: the member's name always sits beside it.
export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: keyof typeof SIZES }) {
  const className = cn('flex shrink-0 items-center justify-center rounded-full font-extrabold', SIZES[size])
  if (src) {
    // A plain <img>: next/image would need the Supabase host configured and adds nothing for a
    // photo already resized to 512px.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden="true" className={cn(className, 'object-cover')} />
  }
  // Array.from splits by code point, so a name starting with an emoji keeps the whole character.
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?'
  return (
    <span aria-hidden="true" className={className}>
      {initial}
    </span>
  )
}
