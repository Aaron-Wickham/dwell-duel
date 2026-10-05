// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STANDALONE_ZOOM_LOCK } from '@/components/app-shell/standalone-zoom-lock'

const BASE = 'width=device-width, initial-scale=1, viewport-fit=cover'

function run(standalone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query === '(display-mode: standalone)' }))
  new Function(STANDALONE_ZOOM_LOCK)()
  return document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content
}

beforeEach(() => {
  document.head.innerHTML = `<meta name="viewport" content="${BASE}">`
})

afterEach(() => vi.unstubAllGlobals())

describe('StandaloneZoomLock (D6, #402)', () => {
  it('leaves a browser tab free to pinch-zoom', () => {
    expect(run(false)).toBe(BASE)
  })

  it('locks zoom in the installed app, once', () => {
    expect(run(true)).toBe(`${BASE}, maximum-scale=1, user-scalable=no`)
    expect(run(true)).toBe(`${BASE}, maximum-scale=1, user-scalable=no`)
  })
})
