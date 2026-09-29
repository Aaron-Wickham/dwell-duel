import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { siteMetadata } from '@/lib/app-shell/site-metadata'

const PUBLIC = path.resolve(import.meta.dirname, '../../../public')

// A PNG's width and height are the two big-endian ints after the IHDR chunk type.
function pngSize(file: string): [number, number] {
  const bytes = readFileSync(path.join(PUBLIC, file))
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

describe('favicon', () => {
  it('is a small tile-less SVG whose D turns white in dark mode, with no embedded metadata', () => {
    const svg = readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8')
    expect(statSync(path.join(PUBLIC, 'favicon.svg')).size).toBeLessThan(2048)
    expect(svg).not.toMatch(/metadata|c2pa/i)
    expect(svg).not.toMatch(/<rect/)
    expect(svg).toMatch(/\.d\{fill:#03272D\}@media \(prefers-color-scheme:dark\)\{\.d\{fill:#FFFFFF\}\}/)
    expect(svg).toMatch(/fill="#72DB2B"/)
  })

  it('has 16, 32 and 48 pixel PNG fallbacks, all declared', () => {
    for (const size of [16, 32, 48]) expect(pngSize(`favicon-${size}.png`)).toEqual([size, size])
    const icons = (siteMetadata.icons as { icon: { url: string }[] }).icon.map((i) => i.url)
    expect(icons).toEqual(['/favicon.svg', '/favicon-48.png', '/favicon-32.png', '/favicon-16.png'])
  })
})
