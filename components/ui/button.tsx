import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonCva = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border-[1.5px] border-transparent font-extrabold leading-[1.2] no-underline disabled:cursor-not-allowed disabled:border-transparent disabled:bg-sunk disabled:text-ink2 aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-sunk aria-disabled:text-ink2',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary',
        secondary: 'border-line-s bg-surface text-ink',
        danger: 'border-loss bg-transparent text-loss',
        quiet: 'bg-transparent text-ink underline decoration-[1.5px] underline-offset-[3px]',
      },
      size: {
        md: 'min-h-12 px-5 text-base',
        sm: 'min-h-11 px-3.5 text-[15px]',
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

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonCva> {}

export function Button({ className, variant, size, block, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
}
