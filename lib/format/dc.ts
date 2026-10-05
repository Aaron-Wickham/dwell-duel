// Every Dwell Coin amount the app shows goes through here, so each is grouped the same way
// ("2,577,831"). Negatives take a true minus sign (U+2212), the app's sign everywhere.
const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatDc(n: number): string {
  const digits = grouped.format(Math.abs(n))
  return n < 0 && digits !== '0' ? `−${digits}` : digits
}

export function formatDcAmount(n: number): string {
  return `${formatDc(n)} DC`
}

// A change: "+2,500,000 DC", "−40 DC", or "0 DC".
export function formatSignedDcAmount(n: number): string {
  return `${n > 0 ? '+' : ''}${formatDcAmount(n)}`
}
