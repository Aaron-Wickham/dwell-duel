import { cn } from '@/lib/utils'
import { uiTextClass, figureClass } from '@/components/ui/page'
import { tintFor } from '@/lib/ui/tint'

// An initial sits on a soft tint picked from the member's name (#445), so a list of members isn't
// one green; never lime, which is for the primary action and first place alone (#380).
const SIZES = {
  sm: 'size-8 text-sm',
  md: 'size-10',
  nav: `size-9 ${uiTextClass}`,
  lg: `size-16 md:size-20 ${figureClass}`,
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
    <span aria-hidden="true" className={cn(className, tintFor(name))}>
      {initial}
    </span>
  )
}
