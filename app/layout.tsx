import { Manrope } from 'next/font/google'
import { cookies } from 'next/headers'
import { StatusBand } from '@/components/app-shell/status-band'
import { VercelMetrics } from '@/components/app-shell/vercel-metrics'
import { LaunchScreen } from '@/components/brand/launch-screen'
import { StandaloneZoomLock } from '@/components/app-shell/standalone-zoom-lock'
import { siteMetadata, siteViewport } from '@/lib/app-shell/site-metadata'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
import { preferenceAttributes, resolvePreferences } from '@/lib/preferences/preferences'
import { ServiceWorkerRegistration } from '@/components/offline/service-worker-registration'
import './globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
})

export const metadata = siteMetadata

export const viewport = siteViewport

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const jar = await cookies()
  const theme = resolveTheme(jar.get(THEME_COOKIE)?.value)
  const prefs = resolvePreferences((name) => jar.get(name)?.value)

  return (
    // The launch screen's cold-start script (and Settings) set attributes on <html> before or
    // after hydration, which React would otherwise report as a mismatch.
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={theme ?? undefined}
      {...preferenceAttributes(prefs)}
      className={`${manrope.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <StandaloneZoomLock />
        <LaunchScreen />
        <StatusBand />
        {children}
        <ServiceWorkerRegistration />
        <VercelMetrics />
      </body>
    </html>
  )
}
