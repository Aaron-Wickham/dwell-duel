import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { siteMetadata, siteViewport, splashMedia, splashPath } from '@/lib/app-shell/site-metadata'
import splashDevices from '@/lib/app-shell/splash-devices.json'

type StartupImage = { url: string; media: string }

describe('siteMetadata', () => {
  it('no longer points at a hand-written manifest, since app/manifest.ts is linked automatically', () => {
    expect(siteMetadata.manifest).toBeUndefined()
  })

  it('makes iOS open it as a full-screen app with a translucent status bar', () => {
    expect(siteMetadata.appleWebApp).toMatchObject({
      capable: true,
      title: 'DwellDuel',
      statusBarStyle: 'black-translucent',
    })
    expect(siteMetadata.other).toEqual({ 'apple-mobile-web-app-capable': 'yes' })
  })

  it('names a portrait splash screen for every listed iPhone, each committed to public/splash', () => {
    const images = (siteMetadata.appleWebApp as { startupImage: StartupImage[] }).startupImage
    expect(images).toHaveLength(splashDevices.length)
    expect(new Set(images.map((image) => image.url)).size).toBe(images.length)
    for (const image of images) {
      expect(image.url).toMatch(/^\/splash\/iphone-\d+x\d+\.png$/)
      expect(existsSync(path.join(process.cwd(), 'public', image.url))).toBe(true)
    }
  })

  it('matches each splash screen to its device by CSS size, pixel ratio and orientation', () => {
    const iphone16 = { width: 393, height: 852, ratio: 3 }
    expect(splashPath(iphone16)).toBe('/splash/iphone-1179x2556.png')
    expect(splashMedia(iphone16)).toBe(
      'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    )
    const images = (siteMetadata.appleWebApp as { startupImage: StartupImage[] }).startupImage
    expect(images).toContainEqual({ url: splashPath(iphone16), media: splashMedia(iphone16) })
  })
})

describe('siteViewport', () => {
  it('runs edge to edge, locks zoom, lets the keyboard resize the page, and keeps the teal theme colour', () => {
    expect(siteViewport).toEqual({
      themeColor: '#03272d',
      colorScheme: 'light dark',
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      viewportFit: 'cover',
      interactiveWidget: 'resizes-content',
    })
  })
})
