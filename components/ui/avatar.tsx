import { cn } from '@/lib/utils'
import { uiTextClass, figureClass } from '@/components/ui/page'

// Every size's initial sits on --acc-soft: a lime fill is for the primary action and first place
// alone (#380), and a large avatar isn't either.
const SIZES = {
  sm: 'size-8 bg-acc-soft text-sm text-acc-text',
  md: 'size-10 bg-acc-soft text-acc-text',
  nav: `size-9 bg-acc-soft ${uiTextClass} text-acc-text`,
  lg: `size-16 bg-acc-soft text-acc-text md:size-20 ${figureClass}`,
} as const

// The phone size of each variant, so the browser reserves the box before the photo arrives.
const PX: Record<keyof typeof SIZES, number> = { sm: 32, md: 40, nav: 36, lg: 64 }

// Decorative either way: the member's name always sits beside it.
export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: keyof typeof SIZES }) {
  const className = cn('flex shrink-0 items-center justify-center rounded-full font-extrabold', SIZES[size])
  if (src) {
    // A plain <img>: next/image would need the Supabase host configured and adds nothing for a
    // photo already resized to 256px. Lazy and async, since a list shows dozens (#210).
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={PX[size]}
        height={PX[size]}
        loading="lazy"
        decoding="async"
        className={cn(className, 'object-cover')}
      />
    )
  }
  // Array.from splits by code point, so a name starting with an emoji keeps the whole character.
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?'
  return (
    <span aria-hidden="true" className={className}>
      {initial}
    </span>
  )
}
