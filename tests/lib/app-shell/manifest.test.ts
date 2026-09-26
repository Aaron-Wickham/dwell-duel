import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import manifest from '@/app/manifest'

describe('manifest', () => {
  it('launches standalone from the root with a stable id', () => {
    expect(manifest()).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      name: 'DwellDuel',
      short_name: 'DwellDuel',
    })
  })

  it('paints the splash and OS chrome in the brand teal', () => {
    expect(manifest()).toMatchObject({ background_color: '#03272d', theme_color: '#03272d' })
  })

  it('lists the 192, 512 and maskable 512 icons, and every one exists in public/', () => {
    const icons = manifest().icons ?? []
    expect(icons).toEqual([
      { src: '/android-chrome-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
    for (const icon of icons) {
      expect(existsSync(path.join(process.cwd(), 'public', icon.src))).toBe(true)
    }
  })

  it('offers the Markets and My slip shortcuts', () => {
    expect(manifest().shortcuts).toEqual([
      { name: 'Markets', url: '/markets' },
      { name: 'My slip', url: '/parlays' },
    ])
  })
})
