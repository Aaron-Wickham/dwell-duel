// Every Dwell Coin amount the app shows goes through here, so each is grouped the same way
// ("2,577,831"). Negatives take a true minus sign (U+2212), the app's sign everywhere. The number
// and its unit are joined by a no-break space (U+00A0), so "DC" never starts a line on its own.
const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatDc(n: number): string {
  const digits = grouped.format(Math.abs(n))
  return n < 0 && digits !== '0' ? `−${digits}` : digits
}

export function formatDcAmount(n: number): string {
  return `${formatDc(n)}\u00A0DC`
}

// A change: "+2,500,000 DC", "−40 DC", or "0 DC".
export function formatSignedDcAmount(n: number): string {
  return `${n > 0 ? '+' : ''}${formatDcAmount(n)}`
}
