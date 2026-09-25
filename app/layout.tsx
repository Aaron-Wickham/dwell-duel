import type { Metadata } from 'next'
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
  title: 'DwellDuel',
  description: 'DwellDuel',
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
