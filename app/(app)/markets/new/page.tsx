import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { Page, PageHeader } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import type { DbClient } from '@/lib/supabase/database'
import type { MarketKind } from '@/lib/markets/kind'
import { formatLine } from '@/lib/markets/kind'
import { isUuid } from '@/lib/uuid'
import { listCategoryCounts, mostUsedCategories } from '@/lib/markets/categories'
import { CreateMarketForm, type MarketPrefill } from './create-market-form'

// Read with the member's own client, so RLS decides what can be copied; a market they can't see
// reads as no row, and the form opens blank.
async function readPrefill(supabase: DbClient, from: string | string[] | undefined, now: number): Promise<MarketPrefill | undefined> {
  if (typeof from !== 'string' || !isUuid(from)) return undefined
  const { data, error } = await supabase
    .from('markets')
    .select('title, description, kind, close_at, line, category:market_categories(name), market_outcomes(label)')
    .eq('id', from)
    // The same outcome order as the market page.
    .order('position', { referencedTable: 'market_outcomes' })
    .maybeSingle()
  if (error) throw error
  if (!data) return undefined
  return {
    title: data.title,
    description: data.description ?? '',
    kind: data.kind as MarketKind,
    category: data.category?.name ?? '',
    outcomes: (data.market_outcomes ?? []).map((o: { label: string }) => o.label),
    line: data.line === null ? '' : formatLine(data.line),
    closeAt: data.close_at,
    now,
  }
}

export default async function NewMarketPage(props: PageProps<'/markets/new'>) {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const { from } = await props.searchParams
  // A server render's clock; the form moves a duplicate's close time past it.
  const [initial, role, counts] = await Promise.all([
    // eslint-disable-next-line react-hooks/purity
    readPrefill(supabase, from, Date.now()),
    getRole(supabase),
    listCategoryCounts(supabase),
  ])
  const categories = { suggestions: counts.map((c) => c.name), popular: mostUsedCategories(counts).map((c) => c.name) }

  return (
    <Page transition="drill-down">
      <BackLink href="/markets">Markets</BackLink>
      <PageHeader title="Create market" />
      {initial && (
        <p className="max-w-[68ch] text-ink2">
          A copy of “{initial.title}”, closing at the same time in a week to come. Check it over: nothing is created until
          you tap Create market.
        </p>
      )}
      {/* Keyed by the source, so moving between duplicates starts each form afresh. */}
      <CreateMarketForm
        key={typeof from === 'string' ? from : 'blank'}
        initial={initial}
        admin={atLeast(role, 'admin')}
        categories={categories}
      />
    </Page>
  )
}
