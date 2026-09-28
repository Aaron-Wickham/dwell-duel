// Regenerates public/favicon.svg and its PNG fallbacks (16, 32, 48). Run by hand after changing
// the art: `node scripts/generate-favicons.mjs`. Uses sharp, which Next installs for itself.
//
// The app-icon treatment: a teal rounded tile with a white D and lime leaves, so it reads the same
// on light and dark tab strips. Tabs show it at 16px, where the symbol's four leaves blur into one
// blob, so it draws two larger leaves, the same at every size. The D's edges sit on the 32-unit
// grid's whole numbers, which land on whole or half pixels at 16px.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC = path.join(import.meta.dirname, '..', 'public')
const TEAL = '#03272D'
const LIME = '#72DB2B'
const WHITE = '#FFFFFF'

// A leaf 10 long and 5 wide, from its base at the origin along +x.
const LEAF = 'M0 0C2.5-2.8 7.5-2.8 10 0C7.5 2.8 2.5 2.8 0 0Z'

const simple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${TEAL}"/><path fill="${WHITE}" fill-rule="evenodd" d="M5 12h9a8 8 0 0 1 0 16H5zm4 4v8h5a4 4 0 0 0 0-8z"/><g fill="${LIME}"><path transform="translate(17.5 13) rotate(-60)" d="${LEAF}"/><path transform="translate(19.5 14) rotate(-16)" d="${LEAF}"/></g></svg>`

await writeFile(path.join(PUBLIC, 'favicon.svg'), simple + '\n')
for (const [size, svg] of [
  [16, simple],
  [32, simple],
  [48, simple],
]) {
  const file = path.join(PUBLIC, `favicon-${size}.png`)
  await sharp(Buffer.from(svg), { density: 72 * (size / 32) * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(file)
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}
