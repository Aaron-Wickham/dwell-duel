import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { siteMetadata } from '@/lib/app-shell/site-metadata'

describe('public pages for crawlers (#459)', () => {
  it('opens only sign-in, privacy and terms', () => {
    const rules = robots().rules
    expect(rules).toEqual([{ userAgent: '*', allow: ['/sign-in', '/privacy', '/terms'], disallow: '/' }])
  })

  it('lists the same pages in the sitemap', () => {
    expect(sitemap().map((e) => e.url)).toEqual([
      'https://www.dwellduel.com/sign-in',
      'https://www.dwellduel.com/privacy',
      'https://www.dwellduel.com/terms',
    ])
  })
})

describe('page titles (#460)', () => {
  it('names every page "<page> · DwellDuel"', () => {
    expect(siteMetadata.title).toEqual({ default: 'DwellDuel', template: '%s · DwellDuel' })
  })

  it('gives every page file a title of its own', () => {
    const root = path.resolve(import.meta.dirname, '../../app')
    const pages: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (name === 'page.tsx') pages.push(full)
      }
    }
    walk(root)
    const untitled = pages.filter((p) => !/export (const metadata|async function generateMetadata)/.test(readFileSync(p, 'utf8')))
    expect(untitled.map((p) => path.relative(root, p))).toEqual([])
  })
})
