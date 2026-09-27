// supabase/migrations/0034_text_length_limits.sql enforces these same numbers.
export const TEXT_LIMITS = {
  marketTitle: 120,
  marketDescription: 1000,
  outcomeLabel: 60,
  taskTitle: 120,
  taskDescription: 1000,
  reviewNote: 500,
  adjustReason: 200,
  inviteEmail: 254,
  displayName: 80,
} as const

export function tooLong(label: string, max: number): string {
  return `${label} can be at most ${max} characters.`
}
