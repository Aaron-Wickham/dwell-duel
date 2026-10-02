import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database as Generated } from '@/lib/supabase/database.types'

// `supabase gen types` writes every function argument as non-null, but these take a real null
// (no description, no photo, a one-off task's period, a title update_market keeps) and have no
// default to fall back on. The generated file stays
// untouched, since CI regenerates it and diffs.
type Fns = Generated['public']['Functions']
// Distributes over an overloaded function's union of signatures, as update_market's (0103).
type NullableArgs<T, K extends PropertyKey> = T extends { Args: infer A }
  ? Omit<T, 'Args'> & { Args: Omit<A, K> & { [P in K & keyof A]: A[P] | null } }
  : never
type Nullable<F extends keyof Fns, K extends PropertyKey> = NullableArgs<Fns[F], K>

export type Database = Omit<Generated, 'public'> & {
  public: Omit<Generated['public'], 'Functions'> & {
    Functions: Omit<Fns, 'compute_period_key' | 'create_market_v3' | 'create_market_v4' | 'update_market' | 'update_my_profile'> & {
      compute_period_key: Nullable<'compute_period_key', 'p_period'>
      create_market_v3: Nullable<'create_market_v3', 'p_description'>
      create_market_v4: Nullable<'create_market_v4', 'p_description'>
      update_market: Nullable<'update_market', 'p_title' | 'p_description'>
      update_my_profile: Nullable<'update_my_profile', 'p_avatar_path'>
    }
  }
}

export type DbClient = SupabaseClient<Database>
