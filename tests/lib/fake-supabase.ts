import type { SupabaseClient } from '@supabase/supabase-js'

// A stand-in for the query builder: it records each query's chain, and answers it when awaited.
export type RecordedQuery = {
  table: string
  select?: string
  selectOptions?: unknown
  eq: [string, unknown][]
  gt: [string, unknown][]
  is: [string, unknown][]
  in: [string, unknown[]][]
  or: string[]
  order: [string, unknown][]
  limit?: number
}

export type FakeResponse = { data?: unknown; count?: number | null; error?: unknown }

export function fakeSupabase(respond: (query: RecordedQuery, index: number) => FakeResponse) {
  const queries: RecordedQuery[] = []
  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, eq: [], gt: [], is: [], in: [], or: [], order: [] }
      const index = queries.push(query) - 1
      const builder = {
        select(columns: string, options?: unknown) {
          query.select = columns
          query.selectOptions = options
          return builder
        },
        eq(column: string, value: unknown) {
          query.eq.push([column, value])
          return builder
        },
        gt(column: string, value: unknown) {
          query.gt.push([column, value])
          return builder
        },
        is(column: string, value: unknown) {
          query.is.push([column, value])
          return builder
        },
        in(column: string, values: unknown[]) {
          query.in.push([column, values])
          return builder
        },
        or(filter: string) {
          query.or.push(filter)
          return builder
        },
        order(column: string, options?: unknown) {
          query.order.push([column, options])
          return builder
        },
        limit(count: number) {
          query.limit = count
          return builder
        },
        then<T>(onFulfilled: (value: FakeResponse) => T, onRejected?: (reason: unknown) => T) {
          return Promise.resolve()
            .then(() => ({ data: null, count: null, error: null, ...respond(query, index) }))
            .then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, queries }
}
