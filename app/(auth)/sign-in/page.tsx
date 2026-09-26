import { Suspense } from 'react'
import { h1Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { DwellDuelSymbol } from '@/components/brand/wordmark'
import { SignInButton } from './sign-in-button'

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-5 p-7 md:p-10">
        <DwellDuelSymbol size={64} />
        <h1 className={h1Class}>
          Friendly bets.
          <br />
          Faithful study.
        </h1>
        <p className="text-ink2">
          DwellDuel is invite-only for our church friend group. Sign in with the Google account your invite was sent to.
        </p>
        <Suspense>
          <SignInButton />
        </Suspense>
      </Card>
    </div>
  )
}
