import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { h1Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { DwellDuelSymbol } from '@/components/brand/wordmark'
import { Blocks } from '@/components/docs/markdown'
import { howItWorks } from '@/lib/docs/how-it-works'
import { unlinkHashLinks } from '@/lib/docs/markdown'

export const metadata: Metadata = {
  title: 'Privacy',
  alternates: { canonical: '/privacy' },
  description: 'What DwellDuel keeps about its members, who can see it, and for how long.',
}

const YOUR_DATA_SLUG = 'your-data'

// Public, for Google's brand review and anyone deciding whether to sign in. It's How it works' Your
// data section, so the policy and the rules members read can't drift apart. The rest of the rules
// is signed-in, so the section's links to it are plain words here.
export default function PrivacyPage() {
  const section = howItWorks.sections.find((s) => s.slug === YOUR_DATA_SLUG)
  if (!section) throw new Error(`docs/HOW-IT-WORKS.md has no "Your data" section`)
  const blocks = unlinkHashLinks(section.blocks)

  return (
    <main id="main" className="flex flex-1 flex-col items-center gap-4 px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[760px] min-w-0 flex-col items-start gap-5 p-7 md:p-10">
        <DwellDuelSymbol size={48} />
        <h1 className={h1Class}>Privacy</h1>
        <div className="flex w-full min-w-0 flex-col gap-3">
          <Blocks blocks={blocks} />
        </div>
      </Card>
      <Link href="/" className="pressable inline-flex min-h-11 items-center gap-1 font-bold text-ink">
        Go to DwellDuel
        <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
      </Link>
    </main>
  )
}
