import type { KnownError } from '@/lib/errors/friendly-error'
import { RATE_LIMIT_ERRORS, TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

// create_market's raises (supabase/migrations/0043, 0103), the write limit (0090) and the constraints
// its inserts can trip.
export const CREATE_MARKET_ERRORS: readonly KnownError<'title' | 'description' | 'category' | 'close_at' | 'outcomes' | 'line'>[] = [
  { match: 'not invited', formError: 'Only invited members can create markets.' },
  { match: 'invalid market kind', formError: 'Choose a market kind.' },
  { match: 'the line must end in .5, like 3.5', formError: 'Set the line to a half number, like 3.5.', field: 'line' },
  { match: 'a market needs at least 2 outcomes', formError: 'Enter at least 2 outcomes.', field: 'outcomes' },
  { match: 'a binary market must have exactly 2 outcomes', formError: 'A Yes/No market needs exactly 2 outcomes.', field: 'outcomes' },
  { match: 'a market may have at most 6 outcomes', formError: 'A market can have at most 6 outcomes.', field: 'outcomes' },
  { match: 'close time must be in the future', formError: 'Choose a close time in the future.', field: 'close_at' },
  { match: 'choose a category', formError: 'Choose a category.', field: 'category' },
  { match: 'market_categories_name_length', formError: tooLong('Category', TEXT_LIMITS.category), field: 'category' },
  RATE_LIMIT_ERRORS.market,
  { ...RATE_LIMIT_ERRORS.category, field: 'category' },
  { match: 'markets_title_length', formError: tooLong('Title', TEXT_LIMITS.marketTitle), field: 'title' },
  { match: 'markets_description_length', formError: tooLong('Description', TEXT_LIMITS.marketDescription), field: 'description' },
  { match: 'market_outcomes_label_length', formError: tooLong('Each outcome', TEXT_LIMITS.outcomeLabel), field: 'outcomes' },
  { match: 'market_outcomes_market_id_label_key', formError: 'Give each outcome a different name.', field: 'outcomes' },
]
