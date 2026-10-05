// PostgREST's max_rows (supabase/config.toml): a read past it comes back cut short, so a read of a
// whole set goes a range at a time. Each read must be ordered, or the ranges can overlap.
const ROWS_PER_READ = 1000

export async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += ROWS_PER_READ) {
    const { data, error } = await read(from, from + ROWS_PER_READ - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < ROWS_PER_READ) return rows
  }
}
