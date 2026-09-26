import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { Page, PageHeader } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { CreateMarketForm } from './create-market-form'

export default async function NewMarketPage() {
  const { user } = await requireUser()
  if (!user) redirect('/sign-in')

  return (
    <Page transition="drill-down">
      <BackLink href="/markets">Markets</BackLink>
      <PageHeader title="Create market" />
      <CreateMarketForm />
    </Page>
  )
}
