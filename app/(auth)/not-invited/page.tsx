import Link from 'next/link'
import { cookies } from 'next/headers'
import { h1Class } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'
import { Message } from '@/components/ui/message'
import { SignInFrame } from '@/components/sign-in/sign-in-frame'
import { GoogleMark } from '@/components/sign-in/google-mark'
import { safeNextPath } from '@/lib/auth/next-path'
import { NOT_INVITED_EMAIL_COOKIE } from '@/lib/auth/not-invited'
import { cn } from '@/lib/utils'
import { RefusedEmail } from './refused-email'

export default async function NotInvitedPage({ searchParams }: PageProps<'/not-invited'>) {
  const email = (await cookies()).get(NOT_INVITED_EMAIL_COOKIE)?.value ?? null
  const { next: rawNext } = await searchParams
  // Signing in again with the invited account still lands where the member was going (#263).
  const next = safeNextPath(typeof rawNext === 'string' ? rawNext : null)

  return (
    <SignInFrame dimmed>
      <Message tone="gold">This Google account isn’t on the invite list.</Message>
      <h1 className={h1Class}>You’re not on the list yet</h1>
      <RefusedEmail email={email} />
      <p className="text-ink2">
        DwellDuel is invite-only. Ask the friend who invited you to check which email they used, or try another account.
      </p>
      {/* Back through sign-in, whose Google button always opens the account chooser (#263). */}
      <Link
        href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}
        className={cn(buttonVariants({ variant: 'primary', block: true }), 'lg:max-w-[380px]')}
      >
        <GoogleMark />
        Try another account
      </Link>
    </SignInFrame>
  )
}
