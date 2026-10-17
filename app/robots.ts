import type { MetadataRoute } from 'next'

// DwellDuel is invite-only (#459): only the sign-in, privacy and terms pages are public, so only
// they are open to crawlers. Every other path redirects a signed-out visitor to sign-in anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/sign-in', '/privacy', '/terms'], disallow: '/' }],
    sitemap: 'https://www.dwellduel.com/sitemap.xml',
  }
}
