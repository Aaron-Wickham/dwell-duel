import { Suspense } from 'react'
import { BookOpen, Lock, TrendingUp, type LucideIcon } from 'lucide-react'
import { h1Class } from '@/components/ui/page'
import { SignInFrame } from '@/components/sign-in/sign-in-frame'
import { cn } from '@/lib/utils'
import { SignInButton } from './sign-in-button'
import { GoogleSignIn } from './google-sign-in'

const FACTS: { Icon: LucideIcon; text: string }[] = [
  { Icon: TrendingUp, text: 'Bet on friendly questions' },
  { Icon: BookOpen, text: 'Earn DC with Bible-study tasks' },
  { Icon: Lock, text: 'Play money, invite-only' },
]

// Public, so Google's brand review (and anyone sent here) can tell what the app is. Written for
// someone who has just been invited: what this is, then the way in. On a short phone the lede and
// facts drop out so the button stays on screen.
export default function SignInPage() {
  // Optional: without it, sign-in goes through Supabase's own Google redirect, as it always has.
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  return (
    <SignInFrame intro>
      <h1 className={cn(h1Class, 'lg:text-[52px]')}>
        Friendly bets.{' '}
        <br />
        Faithful study.
      </h1>
      <p className="text-ink2 short:hidden">
        Bet play-money Dwell Coin on questions from your church friends, and earn more by studying the Bible.
      </p>
      <ul aria-label="What DwellDuel is" className="flex flex-col gap-2.5 short:hidden">
        {FACTS.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-3 font-bold">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-acc-soft text-acc-text">
              <Icon className="size-5" />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 lg:max-w-[380px]">
        <Suspense>{googleClientId ? <GoogleSignIn clientId={googleClientId} /> : <SignInButton />}</Suspense>
        <p className="text-center text-sm text-ink2">Use the Google account your invite was sent to.</p>
      </div>
    </SignInFrame>
  )
}
