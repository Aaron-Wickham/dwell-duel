import type { ReactNode } from 'react'
import Link from 'next/link'
import { DwellDuelSymbol, WordmarkName } from '@/components/brand/wordmark'
import { cn } from '@/lib/utils'
import { SampleMarket } from './sample-market'
import { SignInIntro } from './sign-in-intro'
import { WORDMARK_SYMBOL_ID } from './intro-director'

// The public pages a new invitee meets: the wordmark, a sample market and the page's own copy. One
// column on a phone, card first; at lg the copy sits left of a larger card. `intro` plays the
// brand moment (sign-in only); `dimmed` steps the card back behind /not-invited's notice.
export function SignInFrame({ intro = false, dimmed = false, children }: { intro?: boolean; dimmed?: boolean; children: ReactNode }) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-4 pt-5 pb-[calc(1.75rem+var(--safe-bottom))] short:gap-3.5 md:px-20 md:pt-10 md:pb-20 lg:gap-7"
    >
      {intro && <SignInIntro />}
      <div className="sign-in-intro-wordmark flex min-h-11 items-center gap-2">
        <span id={WORDMARK_SYMBOL_ID} className="-translate-y-[3.15px]">
          <DwellDuelSymbol size={32} />
        </span>
        <WordmarkName className="text-[21px]" />
      </div>
      <div className="grid flex-1 content-start gap-5 short:gap-3.5 lg:grid-cols-2 lg:content-center lg:items-center lg:gap-16">
        <div data-dimmed={dimmed || undefined} className={cn('sign-in-intro-card lg:col-start-2 lg:row-start-1', dimmed && 'opacity-35')}>
          <SampleMarket />
        </div>
        <div className="sign-in-intro-text flex flex-col gap-5 short:gap-3.5 lg:col-start-1 lg:row-start-1 lg:max-w-[480px]">
          {children}
          <p className="text-center text-sm lg:max-w-[380px]">
            <Link href="/privacy" className="hit-area font-bold">
              Privacy
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
