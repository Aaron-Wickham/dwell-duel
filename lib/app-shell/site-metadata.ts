import type { Metadata, Viewport } from 'next'
import splashDevices from './splash-devices.json'

export const BRAND_TEAL = '#03272d'

export type SplashDevice = { width: number; height: number; ratio: number }

export function splashPath({ width, height, ratio }: SplashDevice): string {
  return `/splash/iphone-${width * ratio}x${height * ratio}.png`
}

export function splashMedia({ width, height, ratio }: SplashDevice): string {
  return `screen and (device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`
}

export const siteMetadata: Metadata = {
  metadataBase: new URL('https://www.dwellduel.com'),
  title: 'DwellDuel',
  description: 'Friendly bets. Faithful study.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon-180.png',
  },
  openGraph: { images: ['/og-image-1200x630.png'] },
  // iOS ignores theme_color for the status bar in an installed app. black-translucent lets the
  // page draw under it, where the status band paints the teal behind the time and battery.
  appleWebApp: {
    capable: true,
    title: 'DwellDuel',
    statusBarStyle: 'black-translucent',
    startupImage: (splashDevices as SplashDevice[]).map((device) => ({
      url: splashPath(device),
      media: splashMedia(device),
    })),
  },
  // Next's `capable` emits only the standard mobile-web-app-capable tag. iOS has historically
  // needed Apple's own tag before it shows apple-touch-startup-image splash screens.
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

// viewport-fit=cover lets the page run under the notch and home indicator; the --safe-* tokens
// in globals.css put the chrome back inside the safe area. resizes-content makes the keyboard
// shrink the layout viewport instead of covering a focused field. Zoom is locked: a pinch-zoomed
// installed app leaves the fixed top and tab bars displaced from the screen edges. The
// color-scheme meta applies while the HTML is still being parsed, before globals.css, so a full
// page load in dark mode (a reload after a deploy) paints the browser's dark canvas, not white (#353).
export const siteViewport: Viewport = {
  themeColor: BRAND_TEAL,
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}
