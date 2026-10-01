import Link from 'next/link'
import { cookies } from 'next/headers'
import { Mail } from 'lucide-react'
import { h1Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { safeNextPath } from '@/lib/auth/next-path'
import { NOT_INVITED_EMAIL_COOKIE } from '@/lib/auth/not-invited'
import { cn } from '@/lib/utils'
import { RefusedEmail } from './refused-email'

export default async function NotInvitedPage({ searchParams }: PageProps<'/not-invited'>) {
  const email = (await cookies()).get(NOT_INVITED_EMAIL_COOKIE)?.value ?? null
  const { next: rawNext } = await searchParams
  // Signing in again with the invited account still lands where the member was going (#263).
  const next = safeNextPath(typeof rawNext === 'string' ? rawNext : null)

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[480px] flex-col items-start gap-4 p-7 md:p-10">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Mail className="size-6" />
        </span>
        <h1 className={h1Class}>Not invited</h1>
        <RefusedEmail email={email} />
        <p className="text-ink2">
          This Google account isn’t on the invite list yet. Ask a DwellDuel admin to add it, then sign in again.
        </p>
        <Link
          href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}
          className={cn(buttonVariants({ variant: 'primary', block: true }), 'md:w-auto')}
        >
          Try another account
        </Link>
      </Card>
    </main>
  )
}
