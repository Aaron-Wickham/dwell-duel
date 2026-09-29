import { howItWorks } from '@/lib/docs/how-it-works'
import { inlineText } from '@/lib/docs/markdown'
import { Blocks, InlineContent } from '@/components/docs/markdown'
import { HistoryBackLink } from '@/components/ui/history-back-link'
import { eyebrowClass, Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'

// Clears the sticky top bar (72px at md and up) when a contents link jumps to a heading, with room
// for the card's own padding above it.
const HEADING_OFFSET = 'lg:[&_h2]:scroll-mt-[calc(72px+var(--safe-top)+48px)]'

// The rules members see, rendered from docs/HOW-IT-WORKS.md so the app and the doc never disagree.
export default function HowItWorksPage() {
  const { title, intro, sections } = howItWorks
  return (
    <Page transition="drill-down" width="reading">
      <HistoryBackLink />
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
                <a href={`#how-${section.slug}`} className="flex min-h-11 items-center py-1 font-bold text-ink2 no-underline">
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
          {sections.map((section) => (
            <SectionCard key={section.slug} title={<InlineContent nodes={section.title} />} titleId={`how-${section.slug}`}>
              <Blocks blocks={section.blocks} />
            </SectionCard>
          ))}
        </div>
      </div>
    </Page>
  )
}
