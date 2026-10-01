import { Suspense } from 'react'
import Link from 'next/link'
import { h1Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { BetaBadge } from '@/components/brand/beta-badge'
import { DwellDuelSymbol } from '@/components/brand/wordmark'
import { SignInButton } from './sign-in-button'
import { GoogleSignIn } from './google-sign-in'

// Public, so Google's brand review (and anyone sent here) can tell what the app is.
export default function SignInPage() {
  // Optional: without it, sign-in goes through Supabase's own Google redirect, as it always has.
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-5 p-7 md:p-10">
        <DwellDuelSymbol size={64} />
        <BetaBadge />
        <h1 className={h1Class}>
          Friendly bets.
          <br />
          Faithful study.
        </h1>
        <p className="text-ink2">
          DwellDuel is a prediction game for our church friend group. Members bet Dwell Coin, a play money that can’t be
          bought or cashed out, on friendly questions, and earn more with Bible-study tasks.
        </p>
        <p className="text-ink2">It’s invite-only. Sign in with the Google account your invite was sent to.</p>
        <Suspense>{googleClientId ? <GoogleSignIn clientId={googleClientId} /> : <SignInButton />}</Suspense>
      </Card>
      <Link href="/privacy" className="hit-area text-sm font-bold text-ink2">
        Privacy
      </Link>
    </main>
  )
}
