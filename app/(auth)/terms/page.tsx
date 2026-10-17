import type { Metadata } from 'next'
import Link from 'next/link'
import { h1Class, h2Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { DwellDuelSymbol } from '@/components/brand/wordmark'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The short terms for using DwellDuel: play money, invite only, a friendly game.',
  alternates: { canonical: '/terms' },
}

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Play money only',
    body: [
      'Dwell Coin (DC) has no cash value. You can’t buy it, sell it, cash it out or trade it for anything. Nothing you win or lose here is real money.',
    ],
  },
  {
    title: 'Invite only',
    body: [
      'DwellDuel is for the friends its admins invite. Sign in with the Google account your invite was sent to, and don’t share your access with anyone else.',
    ],
  },
  {
    title: 'Results and balances',
    body: [
      'Admins and reviewers resolve markets and approve tasks as fairly as they can. An admin may correct a result, call off a market or adjust a balance when something went wrong, and their call is final.',
    ],
  },
  {
    title: 'Be kind',
    body: [
      'Markets and comments are for friendly fun. Don’t post anything hurtful, private or embarrassing about someone, and don’t make markets about people who haven’t agreed to it. Admins may remove anything that crosses the line, or remove a member.',
    ],
  },
  {
    title: 'As it is',
    body: [
      'DwellDuel is a small project run by friends. It may change, go down or lose data, and it’s offered as it is, without any promise. These terms may change too; the latest version is always on this page.',
    ],
  },
]

// Public, beside Privacy (#462): the few rules that make it a friendly game, not a gambling app.
export default function TermsPage() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center gap-4 px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[760px] min-w-0 flex-col items-start gap-5 p-7 md:p-10">
        <DwellDuelSymbol size={48} />
        <h1 className={h1Class}>Terms</h1>
        {SECTIONS.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className={h2Class}>{section.title}</h2>
            {section.body.map((p) => (
              <p key={p} className="max-w-[68ch]">
                {p}
              </p>
            ))}
          </section>
        ))}
        <p className="text-sm text-ink2">
          What DwellDuel keeps about you is on the{' '}
          <Link href="/privacy" className="prose-link">
            privacy page
          </Link>
          .
        </p>
      </Card>
      <Link href="/" className="hit-area text-sm font-bold text-ink2">
        Go to DwellDuel
      </Link>
    </main>
  )
}
