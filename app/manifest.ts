import type { MetadataRoute } from 'next'
import { BRAND_TEAL } from '@/lib/app-shell/site-metadata'

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable identity apart from start_url, so moving the launch page later doesn't read as a new app to the OS.
    id: '/',
    name: 'DwellDuel',
    short_name: 'DwellDuel',
    description: 'Friendly bets. Faithful study.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND_TEAL,
    theme_color: BRAND_TEAL,
    icons: [
      { src: '/android-chrome-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Android's long-press menu on the home-screen icon. iOS doesn't support manifest shortcuts.
    shortcuts: [
      { name: 'Markets', url: '/markets' },
      { name: 'My slip', url: '/parlays' },
    ],
  }
}
