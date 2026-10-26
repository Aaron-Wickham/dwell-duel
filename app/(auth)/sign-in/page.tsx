import type { Metadata } from 'next'
import { Suspense } from 'react'
import { h1Class } from '@/components/ui/page'
import { SignInFrame } from '@/components/sign-in/sign-in-frame'
import { cn } from '@/lib/utils'
import { SignInButton } from './sign-in-button'

export const metadata: Metadata = { title: 'Sign in', alternates: { canonical: '/sign-in' } }

// Public, so Google's brand review (and anyone sent here) can tell what the app is. Written for
// someone who has just been invited (#467): the headline says what it is and who it's for, the
// sentence answers "is this real money?" before the button. On a short phone (most iPhone Safari
// tabs) it shrinks to that answer alone, and the sample card drops its bet line to make the room,
// so the button stays on screen without the page scrolling.
export default function SignInPage() {
  // Optional: without it, sign-in goes through Supabase's own Google redirect.
  const direct = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
  return (
    <SignInFrame intro>
      <h1 className={cn(h1Class, 'lg:text-[52px]')}>
        Friendly bets with{' '}
        <br />
        your church friends
      </h1>
      <p className="text-lg text-ink2 short:hidden lg:max-w-[440px]">
        Bet play money on friendly questions, and earn more with Bible study. No real money.
      </p>
      <p className="hidden text-lg text-ink2 short:block">Play money only. No real money.</p>
      <div className="flex flex-col gap-2 lg:max-w-[380px]">
        <Suspense>
          <SignInButton direct={direct} />
        </Suspense>
        <p className="text-center text-sm text-ink2">Use the Google account your invite was sent to.</p>
      </div>
    </SignInFrame>
  )
}
