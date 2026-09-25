import type { Metadata, Viewport } from 'next'
import { Manrope } from 'next/font/google'
import { cookies } from 'next/headers'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
import './globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.dwellduel.com'),
  title: 'DwellDuel',
  description: 'Friendly bets. Faithful study.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon-180.png',
  },
  manifest: '/site.webmanifest',
  openGraph: { images: ['/og-image-1200x630.png'] },
}

export const viewport: Viewport = {
  themeColor: '#03272d',
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html lang="en" data-theme={theme ?? undefined} className={`${manrope.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
