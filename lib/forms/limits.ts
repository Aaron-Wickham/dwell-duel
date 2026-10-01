// supabase/migrations/0034_text_length_limits.sql (0038 for bio, 0042 for the proof notes, 0053
// for market comments) enforces these same numbers.
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
  commentBody: 280,
} as const

export function tooLong(label: string, max: number): string {
  return `${label} can be at most ${max} characters.`
}

// supabase/migrations/0078's write_limits(): how many of each write one member may make in a
// window. tests/db/write-limits.test.ts keeps the two equal.
export const WRITE_LIMITS = {
  market: [{ max: 20, windowSeconds: 86400 }],
  comment: [
    { max: 10, windowSeconds: 60 },
    { max: 200, windowSeconds: 86400 },
  ],
  reaction: [
    { max: 60, windowSeconds: 60 },
    { max: 1000, windowSeconds: 86400 },
  ],
  task_submission: [{ max: 30, windowSeconds: 86400 }],
  bet_cancel: [{ max: 20, windowSeconds: 3600 }],
} as const

export type WriteAction = keyof typeof WRITE_LIMITS

// enforce_write_limit's raise for each action (SQLSTATE DD429), and what the member sees.
const { market, comment, task_submission, bet_cancel } = WRITE_LIMITS

export const RATE_LIMIT_ERRORS = {
  market: {
    match: 'you have created too many markets recently; try again later',
    formError: `You can create up to ${market[0].max} markets a day. Try again later.`,
  },
  comment: {
    match: 'you have posted too many comments recently; try again later',
    formError: `You can post up to ${comment[0].max} comments a minute and ${comment[1].max} a day. Try again in a little while.`,
  },
  reaction: {
    match: 'you have added too many reactions recently; try again later',
    formError: 'You’re reacting faster than we allow. Try again in a minute.',
  },
  task_submission: {
    match: 'you have submitted too many tasks recently; try again later',
    formError: `You can submit up to ${task_submission[0].max} tasks a day. Try again later.`,
  },
  bet_cancel: {
    match: 'you have cancelled too many bets recently; try again later',
    formError: `You can cancel up to ${bet_cancel[0].max} bets an hour. Try again later.`,
  },
} as const satisfies Record<WriteAction, { match: string; formError: string }>
