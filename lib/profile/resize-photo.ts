import { AVATAR_MAX_BYTES, AVATAR_TYPE } from '@/lib/profile/avatar'

// Twice the largest box an avatar renders in (80px), so it's sharp on a 2x screen and small on the wire (#210).
const SIZE = 256

// A phone photo is often several megabytes, well past a server action's 1MB body limit, so it's
// cropped to the centre square and shrunk here, before it ever leaves the browser. JPEG because
// every browser's canvas can encode it (Safari's can't encode WebP).
export async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No 2D canvas')
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, AVATAR_TYPE, 0.85))
    if (!blob || blob.size > AVATAR_MAX_BYTES) throw new Error('Photo too large after resizing')
    return blob
  } finally {
    bitmap.close()
  }
}
