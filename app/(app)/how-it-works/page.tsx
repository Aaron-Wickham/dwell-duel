import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { HistoryBackLink } from '@/components/ui/history-back-link'
import { dividedRowsClass } from '@/components/ui/list-card'
import { h2Class, Page, PageHeader } from '@/components/ui/page'
import { MarkHowItWorksRead } from '@/components/docs/mark-how-it-works-read'

// The short version for members (#398): four plain sections and the questions people ask, with the
// full rules (docs/HOW-IT-WORKS.md, at /how-it-works/rules) a tap away. Keep every line here true
// to that doc; a rule change updates both.
const BASICS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'betting',
    title: 'Betting',
    body: (
      <>
        Pick an outcome and stake Dwell Coin (DC), the app’s play money. The chance is what the group’s bets say right
        now. What your bet pays if it wins is fixed the moment you place it.
      </>
    ),
  },
  {
    id: 'parlays',
    title: 'Parlays',
    body: (
      <>
        Put 2 to 6 picks from different markets into one bet. Every pick has to win, and the payout multiplies. It’s fixed
        when you place it, too.
      </>
    ),
  },
  {
    id: 'earning',
    title: 'Earning DC',
    body: (
      <>
        You start with 100 DC. To earn more, do a Bible-study task on Tasks and tap I did this. A reviewer checks it, and
        its reward is yours once they approve it.
      </>
    ),
  },
  {
    id: 'results',
    title: 'When a market ends',
    body: (
      <>
        Betting stops at its closing time. Its creator, a reviewer or an admin then picks the result and says why, and
        winning bets are paid straight away. Nobody but an admin resolves a market they have money on.
      </>
    ),
  },
]

const QUESTIONS: { id: string; question: string; answer: ReactNode }[] = [
  {
    id: 'voided',
    question: 'What if a market is called off?',
    answer: (
      <>
        It’s called off, with a reason everyone can see. Every bet on it gets back what it cost, and a parlay drops that pick
        and carries on with the rest. If every pick in a parlay is called off, its stake comes back.
      </>
    ),
  },
  {
    id: 'chance',
    question: 'Why did the chance change?',
    answer: (
      <>
        Every bet moves it: backing an outcome raises its chance and lowers the others’. Parlays move it too. A bet already
        placed keeps the payout it was given.
      </>
    ),
  },
  {
    id: 'final',
    question: 'Can I take a bet back?',
    answer: (
      <>
        No. Bets and parlays are final once placed, which is what keeps their payouts fixed. Check the slip before you tap
        Place.
      </>
    ),
  },
  {
    id: 'parlay-pay',
    question: 'How do parlays pay?',
    answer: (
      <>
        Your stake is split evenly across the picks, and each pick’s odds multiply together. The slip shows exactly what
        the parlay pays before you place it. If any pick loses, it pays nothing.{' '}
        <Link href="/how-it-works/rules#how-the-slip-solo-bets-and-parlays" transitionTypes={['nav-forward']}>
          The parlay maths
        </Link>
      </>
    ),
  },
]

export default function HowItWorksPage() {
  return (
    <Page transition="drill-down" width="reading">
      <HistoryBackLink />
      <MarkHowItWorksRead />
      <PageHeader title="How it works" />
      <div className="flex flex-col gap-4">
        {BASICS.map(({ id, title, body }) => (
          <section key={id} aria-labelledby={`how-short-${id}`} className="flex flex-col gap-1">
            <h2 id={`how-short-${id}`} className={h2Class}>
              {title}
            </h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
      <section aria-labelledby="how-questions" className="flex flex-col gap-1">
        <h2 id="how-questions" className={h2Class}>
          Questions
        </h2>
        <div className={dividedRowsClass}>
          {QUESTIONS.map(({ id, question, answer }) => (
            <details key={id} id={`how-q-${id}`} className="group">
              {/* flex drops the browser's disclosure marker, so the chevron says this opens. */}
              <summary className="pressable flex min-h-[52px] cursor-pointer items-center justify-between gap-3 font-bold">
                {question}
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 shrink-0 text-ink2 transition-transform duration-(--duration-fast) group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="pb-3.5 text-ink2">{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <Link href="/how-it-works/rules" transitionTypes={['nav-forward']} className="hit-area pressable self-start font-bold">
        Read the full rules
      </Link>
    </Page>
  )
}
