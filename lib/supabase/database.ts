import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database as Generated } from '@/lib/supabase/database.types'

// `supabase gen types` writes every function argument as non-null, but these take a real null
// (no description, no photo, a one-off task's period) and have no default to fall back on. The generated file stays
// untouched, since CI regenerates it and diffs.
type Fns = Generated['public']['Functions']
type Nullable<F extends keyof Fns, K extends keyof Fns[F]['Args']> = Omit<Fns[F], 'Args'> & {
  Args: Omit<Fns[F]['Args'], K> & { [P in K]: Fns[F]['Args'][P] | null }
}

export type Database = Omit<Generated, 'public'> & {
  public: Omit<Generated['public'], 'Functions'> & {
    Functions: Omit<Fns, 'compute_period_key' | 'create_market' | 'create_market_v2' | 'create_market_v3' | 'update_market' | 'update_my_profile'> & {
      compute_period_key: Nullable<'compute_period_key', 'p_period'>
      create_market: Nullable<'create_market', 'p_description'>
      create_market_v2: Nullable<'create_market_v2', 'p_description'>
      create_market_v3: Nullable<'create_market_v3', 'p_description'>
      update_market: Nullable<'update_market', 'p_description'>
      update_my_profile: Nullable<'update_my_profile', 'p_avatar_path'>
    }
  }
}

export type DbClient = SupabaseClient<Database>
