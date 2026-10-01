import { Fragment } from 'react'
import { ChevronDown } from 'lucide-react'
import { howItWorks } from '@/lib/docs/how-it-works'
import { inlineText } from '@/lib/docs/markdown'
import { Blocks, InlineContent, SECTION_ID_PREFIX } from '@/components/docs/markdown'
import { HistoryBackLink } from '@/components/ui/history-back-link'
import { eyebrowClass, Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { cardClass } from '@/components/ui/card'
import { MarkHowItWorksRead } from '@/components/docs/mark-how-it-works-read'
import { ScrollToHash } from '@/components/docs/scroll-to-hash'
import type { DocSection } from '@/lib/docs/markdown'

// Clears the sticky top bar (64px on a phone, 72px from md) when a link jumps to a heading, with
// room for the card's own padding above it. The bar is sticky at every width, so this is too.
const HEADING_OFFSET = '[&_h2]:scroll-mt-[calc(64px+var(--safe-top)+40px)] md:[&_h2]:scroll-mt-[calc(72px+var(--safe-top)+48px)]'

// Below lg, where the sticky contents list has no room, a collapsed list sits after the doc's first
// section (The short version) and links the ones below it (#260).
function PhoneContents({ sections }: { sections: DocSection[] }) {
  return (
    <details className={`group lg:hidden ${cardClass} px-[18px] md:px-6`}>
      {/* flex drops the browser's disclosure marker, so the chevron says this opens. */}
      <summary className="pressable flex min-h-12 cursor-pointer items-center justify-between gap-3 font-extrabold">
        On this page
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 transition-transform duration-(--duration-fast) group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <nav aria-label="On this page" className="pb-2">
        <ul className="flex flex-col">
          {sections.map((section) => (
            <li key={section.slug}>
              <a href={`#${SECTION_ID_PREFIX}${section.slug}`} className="flex min-h-11 items-center py-1 font-bold">
                {inlineText(section.title)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  )
}

// The rules members see, rendered from docs/HOW-IT-WORKS.md so the app and the doc never disagree.
export default function HowItWorksPage() {
  const { title, intro, sections } = howItWorks
  return (
    <Page transition="drill-down" width="reading">
      <HistoryBackLink />
      <MarkHowItWorksRead />
      <ScrollToHash />
      <PageHeader title={<InlineContent nodes={title} />} />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
        <nav
          aria-labelledby="how-contents"
          className="hidden lg:sticky lg:top-[calc(72px+var(--safe-top)+24px)] lg:flex lg:flex-col lg:gap-2"
        >
          <p id="how-contents" className={eyebrowClass}>
            Contents
          </p>
          <ul className="flex flex-col">
            {sections.map((section) => (
              <li key={section.slug}>
                <a href={`#${SECTION_ID_PREFIX}${section.slug}`} className="pressable flex min-h-11 items-center py-1 font-bold text-ink2 no-underline">
                  {inlineText(section.title)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={`flex min-w-0 flex-col gap-5 md:gap-7 ${HEADING_OFFSET}`}>
          {intro.length > 0 && (
            <div className="flex flex-col gap-3">
              <Blocks blocks={intro} />
            </div>
          )}
          {sections.map((section, index) => (
            <Fragment key={section.slug}>
              <SectionCard title={<InlineContent nodes={section.title} />} titleId={`${SECTION_ID_PREFIX}${section.slug}`}>
                <Blocks blocks={section.blocks} />
              </SectionCard>
              {index === 0 && <PhoneContents sections={sections.slice(1)} />}
            </Fragment>
          ))}
        </div>
      </div>
    </Page>
  )
}
