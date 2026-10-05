import { Suspense } from 'react'
import { h1Class } from '@/components/ui/page'
import { SignInFrame } from '@/components/sign-in/sign-in-frame'
import { cn } from '@/lib/utils'
import { SignInButton } from './sign-in-button'

// Public, so Google's brand review (and anyone sent here) can tell what the app is. Written for
// someone who has just been invited: what this is, in one plain sentence (#387), then the way in. On
// a short phone the sentence drops out so the button stays on screen.
export default function SignInPage() {
  // Optional: without it, sign-in goes through Supabase's own Google redirect.
  const direct = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
  return (
    <SignInFrame intro>
      <h1 className={cn(h1Class, 'lg:text-[52px]')}>
        Friendly bets.{' '}
        <br />
        Faithful study.
      </h1>
      <p className="text-lg text-ink2 short:hidden lg:max-w-[440px]">
        Bet on friendly questions and earn DC with Bible-study tasks. Play money, invite-only.
      </p>
      <div className="flex flex-col gap-2 lg:max-w-[380px]">
        <Suspense>
          <SignInButton direct={direct} />
        </Suspense>
        <p className="text-center text-sm text-ink2">Use the Google account your invite was sent to.</p>
      </div>
    </SignInFrame>
  )
}
