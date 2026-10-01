// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downscaleImage, PROOF_MAX_SIDE, PROOF_QUALITY } from '@/lib/proof/downscale'

// #253: proof is kept small because the Storage plan is 1 GB.
const toBlob = vi.fn()
const drawImage = vi.fn()
let canvas: { width: number; height: number; getContext: () => unknown; toBlob: typeof toBlob }

beforeEach(() => {
  canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement)
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }))
  toBlob.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const photo = () => new File(['x'], 'IMG_1.heic', { type: 'image/heic' })

describe('downscaleImage', () => {
  it('shrinks to 1200px on the long side and encodes WebP at quality 0.7', async () => {
    toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(new Blob(['w'], { type: 'image/webp' })))
    const out = await downscaleImage(photo())
    expect([canvas.width, canvas.height]).toEqual([1200, 900])
    expect(PROOF_MAX_SIDE).toBe(1200)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', PROOF_QUALITY)
    expect(PROOF_QUALITY).toBe(0.7)
    expect(out.type).toBe('image/webp')
    expect(out.name).toBe('IMG_1.webp')
  })

  it('falls back to JPEG when the browser hands back something other than WebP', async () => {
    toBlob.mockImplementation((cb: (b: Blob | null) => void, type: string) =>
      cb(new Blob(['j'], { type: type === 'image/webp' ? 'image/png' : type })),
    )
    const out = await downscaleImage(photo())
    expect(toBlob).toHaveBeenLastCalledWith(expect.any(Function), 'image/jpeg', PROOF_QUALITY)
    expect(out.type).toBe('image/jpeg')
    expect(out.name).toBe('IMG_1.jpg')
  })

  it('never scales a small image up', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }))
    toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(new Blob(['w'], { type: 'image/webp' })))
    await downscaleImage(photo())
    expect([canvas.width, canvas.height]).toEqual([800, 600])
  })

  it('uploads a format the browser cannot decode as it is', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')))
    const file = photo()
    expect(await downscaleImage(file)).toBe(file)
  })
})
