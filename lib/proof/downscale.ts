// Phone photos run to several megabytes and the proof bucket is on a 1 GB plan (#253); proof only
// needs to be legible, so it's shrunk to at most 1200px on its long side at quality 0.7 before
// upload, as WebP where the browser can encode it (Safari can't, and hands back a PNG, so it falls
// back to JPEG). A format the browser can't decode (HEIC outside Safari) goes up as it is, within
// the bucket's own size and type limits.
export const PROOF_MAX_SIDE = 1200
export const PROOF_QUALITY = 0.7

type Encoded = { blob: Blob; extension: string }

async function encode(canvas: HTMLCanvasElement): Promise<Encoded | null> {
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, PROOF_QUALITY))
  const webp = await toBlob('image/webp')
  if (webp?.type === 'image/webp') return { blob: webp, extension: '.webp' }
  const jpeg = await toBlob('image/jpeg')
  return jpeg ? { blob: jpeg, extension: '.jpg' } : null
}

export async function downscaleImage(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  try {
    const scale = Math.min(1, PROOF_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const encoded = await encode(canvas)
    if (!encoded) return file
    return new File([encoded.blob], file.name.replace(/\.[^.]+$/, '') + encoded.extension, { type: encoded.blob.type })
  } finally {
    bitmap.close()
  }
}
