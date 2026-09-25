import Link from 'next/link'
import { h1Class } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'

export function NotFoundBody() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 md:px-20">
      <div className="flex w-full max-w-[560px] flex-col items-start gap-4">
        <p aria-hidden="true" className="text-[96px] leading-[0.9] font-extrabold tracking-[-0.05em] text-ink md:text-[140px]">
          4<span className="text-wm-b">0</span>4
        </p>
        <h1 className={h1Class}>Page not found</h1>
        <p className="text-ink2">This page wandered off. The link may be old, or the market was removed.</p>
        <Link href="/" className={buttonVariants({ variant: 'primary' })}>
          Back home
        </Link>
      </div>
    </div>
  )
}
