// Regenerates public/favicon.svg and its PNG fallbacks (16, 32, 48). Run by hand after changing
// the art: `node scripts/generate-favicons.mjs`. Uses sharp, which Next installs for itself.
//
// The mark is a big D with one lime leaf, drawn to fill the tab: at 16px the symbol's four leaves
// blur into one blob, and a tile around it would spend a fifth of the pixels on margin. The SVG has
// no tile and switches the D between teal and white with the browser's colour scheme, so it reads
// on light and dark tab strips in Chrome and Firefox. Safari ignores media queries inside a
// favicon, so the PNG fallbacks put the same mark on a teal tile, which reads on either.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC = path.join(import.meta.dirname, '..', 'public')
const TEAL = '#03272D'
const LIME = '#72DB2B'
const WHITE = '#FFFFFF'

const D = 'M6 14H44A36 36 0 0 1 44 86H6ZM28 36V64H44A14 14 0 0 0 44 36Z'
const LEAF = 'M64 4C84 12 92 30 78 44C64 36 58 18 64 4Z'

const adaptive = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.d{fill:${TEAL}}@media (prefers-color-scheme:dark){.d{fill:${WHITE}}}</style><path class="d" fill-rule="evenodd" d="${D}"/><path fill="${LIME}" d="${LEAF}"/></svg>`

const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${TEAL}"/><g transform="translate(15 15) scale(0.7)"><path fill="${WHITE}" fill-rule="evenodd" d="${D}"/><path fill="${LIME}" d="${LEAF}"/></g></svg>`

await writeFile(path.join(PUBLIC, 'favicon.svg'), adaptive + '\n')
for (const size of [16, 32, 48]) {
  const file = path.join(PUBLIC, `favicon-${size}.png`)
  await sharp(Buffer.from(tile), { density: 72 * (size / 100) * 8 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file)
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}
