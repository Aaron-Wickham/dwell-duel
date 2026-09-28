// A row's DOM id, from its list's prefix and the row's own id (the key's tiebreak column, unique
// within a list). Anything outside [A-Za-z0-9-] is escaped as _ and four hex digits, so a feed id
// like `win:12:<uuid>` stays a plain token and two different ids can never share a DOM id.
export function rowDomId(prefix: string, id: string | number): string {
  const safe = String(id).replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `${prefix}-${safe}`
}

// The attributes of a row "Show more" can move focus to. tabIndex -1 makes it focusable by script
// only, never a tab stop. A list item or an article has no accessible name of its own, so by
// default the row is labelled by itself, which names it from its content, and a screen reader
// announces the row that focus lands on. `labelId` overrides that for a row (MarketCard) whose
// full content would otherwise make a verbose name, pointing aria-labelledby at a narrower element
// (its title) instead.
export function focusTarget(domId: string | undefined, labelId?: string) {
  return domId ? ({ id: domId, tabIndex: -1, 'aria-labelledby': labelId ?? domId } as const) : {}
}
