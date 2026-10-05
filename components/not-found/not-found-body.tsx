import Link from 'next/link'
import { h1Class } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'

export function NotFoundBody() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 md:px-20">
      <div className="flex w-full max-w-[560px] flex-col items-start gap-4">
        <h1 className={h1Class}>Page not found</h1>
        <p className="text-ink2">The link may be old, or what it pointed to was removed.</p>
        <Link href="/" className={buttonVariants({ variant: 'primary' })}>
          Go home
        </Link>
      </div>
    </div>
  )
}
