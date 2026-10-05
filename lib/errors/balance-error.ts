import { formatDcAmount } from '@/lib/format/dc'

// A debit past zero trips the profiles table's `check (balance >= 0)`, which Postgres names profiles_balance_check.
export function isBalanceCheckViolation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23514' && (error.message ?? '').includes('profiles_balance_check')
}

// `needed` is what the slip asked for, so the message can say how far short it is.
export function insufficientBalanceMessage(balance: number, needed?: number): string {
  if (needed !== undefined && needed > balance) {
    return `You have ${formatDcAmount(balance)}, ${formatDcAmount(needed - balance)} short. Try a smaller stake.`
  }
  return `You only have ${formatDcAmount(balance)}. Try a smaller stake.`
}
