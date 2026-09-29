import type { SupabaseClient } from '@supabase/supabase-js'

// A stand-in for the query builder: it records each query's chain, and answers it when awaited.
export type RecordedQuery = {
  // The table, or for an rpc() the function, whose result the chain filters.
  table: string
  rpc?: boolean
  select?: string
  selectOptions?: unknown
  eq: [string, unknown][]
  gt: [string, unknown][]
  lte: [string, unknown][]
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
    rpc(fn: string) {
      const builder = client.from(fn)
      queries[queries.length - 1].rpc = true
      return builder
    },
    from(table: string) {
      const query: RecordedQuery = { table, eq: [], gt: [], lte: [], is: [], in: [], or: [], order: [] }
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
        lte(column: string, value: unknown) {
          query.lte.push([column, value])
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
        // A single-row read answers with whatever `respond` gives, so it hands back the row itself.
        maybeSingle() {
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
