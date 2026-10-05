import type { Metadata } from 'next'
import Link from 'next/link'
import { h1Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { DwellDuelSymbol } from '@/components/brand/wordmark'
import { Blocks, SECTION_ID_PREFIX } from '@/components/docs/markdown'
import { howItWorks } from '@/lib/docs/how-it-works'
import { rebaseHashLinks } from '@/lib/docs/markdown'

export const metadata: Metadata = {
  title: 'Privacy · DwellDuel',
  description: 'What DwellDuel keeps about its members, who can see it, and for how long.',
}

const YOUR_DATA_SLUG = 'your-data'

// Public, for Google's brand review and anyone deciding whether to sign in. It's How it works' Your
// data section, so the policy and the rules members read can't drift apart. Its links to other
// sections go to the full rules, which ask a signed-out visitor to sign in first.
export default function PrivacyPage() {
  const section = howItWorks.sections.find((s) => s.slug === YOUR_DATA_SLUG)
  if (!section) throw new Error(`docs/HOW-IT-WORKS.md has no "Your data" section`)
  const blocks = rebaseHashLinks(section.blocks, `/how-it-works/rules#${SECTION_ID_PREFIX}`)

  return (
    <main id="main" className="flex flex-1 flex-col items-center gap-4 px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[760px] min-w-0 flex-col items-start gap-5 p-7 md:p-10">
        <DwellDuelSymbol size={48} />
        <h1 className={h1Class}>Privacy</h1>
        <div className="flex w-full min-w-0 flex-col gap-3">
          <Blocks blocks={blocks} />
        </div>
      </Card>
      <Link href="/" className="hit-area text-sm font-bold text-ink2">
        Go to DwellDuel
      </Link>
    </main>
  )
}
