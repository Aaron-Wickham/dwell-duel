// The six tint pairs in globals.css (#445), as whole class names so Tailwind sees them.
export const TINTS = [
  'bg-tint1-soft text-tint1',
  'bg-tint2-soft text-tint2',
  'bg-tint3-soft text-tint3',
  'bg-tint4-soft text-tint4',
  'bg-tint5-soft text-tint5',
  'bg-tint6-soft text-tint6',
] as const

// The same key always gets the same tint, so a category or a member keeps its colour everywhere.
export function tintFor(key: string): (typeof TINTS)[number] {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return TINTS[(hash >>> 0) % TINTS.length]
}
