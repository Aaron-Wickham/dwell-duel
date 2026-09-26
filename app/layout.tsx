import { Manrope } from 'next/font/google'
import { cookies } from 'next/headers'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { StatusBand } from '@/components/app-shell/status-band'
import { siteMetadata, siteViewport } from '@/lib/app-shell/site-metadata'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
import { ServiceWorkerRegistration } from '@/components/offline/service-worker-registration'
import './globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

export const metadata = siteMetadata

export const viewport = siteViewport

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html lang="en" data-theme={theme ?? undefined} className={`${manrope.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <StatusBand />
        {children}
        <ServiceWorkerRegistration />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
