import { uiTextClass } from '@/components/ui/page'

// The "G" on a button that goes to Google's sign-in: Sign in with Google, and Try another account.
export function GoogleMark() {
  return (
    <span aria-hidden="true" className={`flex size-[26px] items-center justify-center rounded-full bg-on-primary ${uiTextClass} font-extrabold text-primary`}>
      G
    </span>
  )
}
