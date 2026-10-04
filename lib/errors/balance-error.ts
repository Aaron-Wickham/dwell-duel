import { formatDcAmount } from '@/lib/format/dc'

// A debit past zero trips the profiles table's `check (balance >= 0)`, which Postgres names profiles_balance_check.
export function isBalanceCheckViolation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23514' && (error.message ?? '').includes('profiles_balance_check')
}

export function insufficientBalanceMessage(balance: number): string {
  return `Insufficient balance — you have ${formatDcAmount(balance)}. Try a smaller amount.`
}
