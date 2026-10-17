import type { MetadataRoute } from 'next'

// The public pages only (#459); see robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  return ['/sign-in', '/privacy', '/terms'].map((path) => ({ url: `https://www.dwellduel.com${path}` }))
}
