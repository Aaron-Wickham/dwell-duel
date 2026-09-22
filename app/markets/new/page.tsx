import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { CreateMarketForm } from './create-market-form'

export default async function NewMarketPage() {
  const { user } = await requireUser()
  if (!user) redirect('/sign-in')

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">New market</h1>
      <div className="mt-4">
        <CreateMarketForm />
      </div>
    </div>
  )
}
