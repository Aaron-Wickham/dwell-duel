import { assertLocal } from './helpers'

// PostgREST doesn't expose pg_catalog, so catalog and EXPLAIN reads go through the local stack's
// postgres-meta service: the /pg route Supabase Studio uses, behind the service-role key.
// A multi-statement query runs as one implicit transaction, so a `set local` holds for the rest
// of it and never leaks into postgres-meta's pooled connection. The answer is the rows of the
// last statement that returned any.
export async function pgQuery<Row>(sql: string): Promise<Row[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
  assertLocal(url)
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`postgres-meta ${res.status}: ${body.message ?? JSON.stringify(body)}`)
  return body as Row[]
}
