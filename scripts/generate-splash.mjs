// Regenerates the iOS launch screens in public/splash/ from lib/app-shell/splash-devices.json.
// Run by hand after changing that list or the symbol: `node scripts/generate-splash.mjs`.
// It uses sharp, which Next installs as its own image optimiser; it is not a runtime dependency.
import { mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import devices from '../lib/app-shell/splash-devices.json' with { type: 'json' }

const OUT_DIR = path.join(import.meta.dirname, '..', 'public', 'splash')

// The same art as DwellDuelSymbol (components/brand/wordmark.tsx), in its dark-theme colours,
// since the splash is teal in both themes.
const TEAL = '#03272D'
const LIME = '#72DB2B'
const WHITE = '#FFFFFF'
const LEAF = 'M50 3 C60 11 57 24 48 27 C41 20 43 10 50 3 Z'
const D_SHAPE = 'M14 26 H42 A24 24 0 0 1 42 74 H14 Z M28 40 H42 A10 10 0 0 1 42 60 H28 Z'

function splashSvg(width, height) {
  const symbol = Math.round(Math.min(width, height) * 0.32)
  const x = Math.round((width - symbol) / 2)
  const y = Math.round((height - symbol) / 2)
  const leaves = [30, 50, 70, 90].map((angle) => `<path d="${LEAF}" transform="rotate(${angle} 50 50)"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${TEAL}"/>
  <svg x="${x}" y="${y}" width="${symbol}" height="${symbol}" viewBox="0 0 100 100">
    <g transform="translate(50 50) translate(-55.5 -41.5)">
      <g fill="${LIME}">${leaves}</g>
      <path fill="${WHITE}" fill-rule="evenodd" d="${D_SHAPE}"/>
    </g>
  </svg>
</svg>`
}

await mkdir(OUT_DIR, { recursive: true })
for (const file of await readdir(OUT_DIR)) {
  if (file.endsWith('.png')) await rm(path.join(OUT_DIR, file))
}

for (const { width, height, ratio } of devices) {
  const pxWidth = width * ratio
  const pxHeight = height * ratio
  const file = path.join(OUT_DIR, `iphone-${pxWidth}x${pxHeight}.png`)
  await sharp(Buffer.from(splashSvg(pxWidth, pxHeight)))
    .png({ compressionLevel: 9, palette: true })
    .toFile(file)
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}
