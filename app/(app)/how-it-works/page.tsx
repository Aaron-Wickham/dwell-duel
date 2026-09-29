import { howItWorks } from '@/lib/docs/how-it-works'
import { Blocks, InlineContent } from '@/components/docs/markdown'
import { HistoryBackLink } from '@/components/ui/history-back-link'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'

// The rules members see, rendered from docs/HOW-IT-WORKS.md so the app and the doc never disagree.
export default function HowItWorksPage() {
  const { title, intro, sections } = howItWorks
  return (
    <Page transition="drill-down">
      <HistoryBackLink />
      <PageHeader title={<InlineContent nodes={title} />} />
      <div className="flex max-w-[720px] flex-col gap-5 md:gap-7">
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
    </Page>
  )
}
