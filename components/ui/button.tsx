import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { uiTextClass } from '@/components/ui/page'

const buttonCva = cva(
  'pressable inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border-[1.5px] border-transparent font-extrabold leading-[1.2] no-underline disabled:cursor-not-allowed disabled:border-transparent disabled:bg-sunk disabled:text-ink2 aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-sunk aria-disabled:text-ink2',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary/88',
        secondary: 'border-line-s bg-surface text-ink hover:bg-sunk',
        danger: 'border-loss bg-transparent text-loss hover:bg-loss-soft',
        quiet: 'bg-transparent text-ink underline decoration-[1.5px] underline-offset-[3px] hover:decoration-[3px]',
      },
      size: {
        md: 'min-h-12 px-5 text-base',
        sm: `min-h-11 px-3.5 ${uiTextClass}`,
      },
      block: {
        true: 'w-full',
      },
    },
    compoundVariants: [{ variant: 'quiet', class: 'px-2.5' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export function buttonVariants(opts?: VariantProps<typeof buttonCva>): string {
  return cn(buttonCva(opts))
}

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonCva> {}

export function Button({ className, variant, size, block, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
}
