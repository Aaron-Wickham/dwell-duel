import Link from 'next/link'
import { Mail } from 'lucide-react'
import { h1Class } from '@/components/ui/page'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotInvitedPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[480px] flex-col items-start gap-4 p-7 md:p-10">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
          <Mail className="size-6" />
        </span>
        <h1 className={h1Class}>Not invited</h1>
        <p className="text-ink2">
          This Google account isn’t on the invite list yet. Ask a DwellDuel admin to add it, then sign in again.
        </p>
        <Link href="/sign-in" className={cn(buttonVariants({ variant: 'primary', block: true }), 'md:w-auto')}>
          Try another account
        </Link>
      </Card>
    </div>
  )
}
