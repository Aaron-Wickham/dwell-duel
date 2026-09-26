const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Postgres rejects a malformed uuid literal with an error rather than matching no rows,
// so a route id is checked here before it reaches a query.
export function isUuid(value: string): boolean {
  return UUID.test(value)
}
