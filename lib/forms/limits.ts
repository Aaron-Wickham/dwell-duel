// supabase/migrations/0034_text_length_limits.sql (0038 for bio, 0042 for the proof notes) enforces
// these same numbers.
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
  bio: 160,
  proofNote: 500,
  resolutionNote: 1000,
} as const

export function tooLong(label: string, max: number): string {
  return `${label} can be at most ${max} characters.`
}
