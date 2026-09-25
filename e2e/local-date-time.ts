// A datetime-local input expects a LOCAL wall-clock string -- toISOString()
// is always UTC, so filling the field with it directly only works by luck
// on a machine in a west-of-UTC timezone (the exact bug fixed in
// create-market-form.tsx's own close_at handling). Build the wall-clock
// string from local getters instead, so this test is correct regardless
// of what timezone it runs in.
export function localDateTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
