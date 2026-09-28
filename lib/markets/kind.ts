// supabase/migrations/0043's markets.kind.
export type MarketKind = 'binary' | 'multiple_choice' | 'over_under'

// A line reads the way it's stored: 3.5, never 3.50.
export function formatLine(line: number): string {
  return String(line)
}
