// Checks the installed iPhone app (a Home Screen web app) in the iOS Simulator, which Playwright
// can't: it has no standalone mode, and the installed app sizes its viewport differently from
// Safari (a short page got a viewport 62pt short, #127/#128). See docs/ARCHITECTURE.md, "Checking
// the installed app". Run it with `npm run check:ios`.
//
//   npm run check:ios -- [--path /sign-in] [--port 3000] [--skip-build] [--video]
//
// It builds and serves the app, puts a small proxy in front of it that adds a measuring script to
// every page, points the simulator's installed DwellDuel web app at --path, cold-launches it, and
// fails when the page's viewport is shorter than the screen. --video also records the launch and
// writes contact sheets (needs ffmpeg). Install the web app once by hand; the script says how.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    path: { type: 'string', default: '/sign-in' },
    port: { type: 'string', default: '3000' },
    'skip-build': { type: 'boolean', default: false },
    video: { type: 'boolean', default: false },
  },
})

const PORT = Number(args.port)
const APP_PORT = PORT + 100
const REPORT_PATH = '/__standalone-check/report'
// A viewport within this many points of the screen counts as full height.
const TOLERANCE_PT = 2
const REPORT_TIMEOUT_MS = 30_000
const ROOT = path.join(import.meta.dirname, '..')
const OUT_DIR = mkdtempSync(path.join(os.tmpdir(), 'dwellduel-standalone-'))

const MEASURE_SCRIPT = `<script>
addEventListener('load', () => setTimeout(() => {
  fetch('${REPORT_PATH}', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    path: location.pathname,
    standalone: matchMedia('(display-mode: standalone)').matches,
    innerHeight, innerWidth,
    screenHeight: screen.height, screenWidth: screen.width,
    visualViewportHeight: visualViewport ? visualViewport.height : null,
    documentHeight: document.documentElement.scrollHeight,
  }) })
}, 1500))
</script>`

const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', ...opts })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function bootedDevice() {
  const { devices } = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']))
  const booted = Object.values(devices).flat()[0]
  if (!booted) throw new Error('No booted simulator. Boot one first, e.g. `xcrun simctl boot "iPhone 17 Pro"` and `open -a Simulator`.')
  return booted
}

// Home Screen web apps live as .webclip bundles in the device's data directory; the one whose
// title is DwellDuel is ours. Its URL is a plain plist value, so it can be pointed anywhere.
function findWebClip(udid) {
  const dir = path.join(os.homedir(), 'Library/Developer/CoreSimulator/Devices', udid, 'data/Library/WebClips')
  if (!existsSync(dir)) return null
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.webclip'))) {
    const plist = path.join(dir, name, 'Info.plist')
    const title = run('plutil', ['-extract', 'Title', 'raw', plist]).trim()
    if (title === 'DwellDuel') return { id: name.replace(/\.webclip$/, ''), plist }
  }
  return null
}

function startProxy(reports) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === REPORT_PATH) {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        reports.push(JSON.parse(body))
        res.writeHead(204).end()
      })
      return
    }
    // Ask for an uncompressed body so the script can be spliced into HTML.
    const headers = { ...req.headers, host: `localhost:${APP_PORT}`, 'accept-encoding': 'identity' }
    const upstream = http.request({ port: APP_PORT, path: req.url, method: req.method, headers }, (up) => {
      const isHtml = (up.headers['content-type'] ?? '').includes('text/html')
      if (!isHtml) {
        res.writeHead(up.statusCode, up.headers)
        up.pipe(res)
        return
      }
      const chunks = []
      up.on('data', (chunk) => chunks.push(chunk))
      up.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8').replace('</body>', `${MEASURE_SCRIPT}</body>`)
        const { 'content-length': _length, 'transfer-encoding': _encoding, ...rest } = up.headers
        res.writeHead(up.statusCode, { ...rest, 'content-length': Buffer.byteLength(html) })
        res.end(html)
      })
    })
    upstream.on('error', () => res.writeHead(502).end())
    req.pipe(upstream)
  })
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)))
}

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    const ok = await new Promise((resolve) => {
      http.get({ port: APP_PORT, path: '/sign-in' }, (res) => resolve(res.statusCode < 500)).on('error', () => resolve(false))
    })
    if (ok) return
    await sleep(500)
  }
  throw new Error(`The app didn't start on port ${APP_PORT}.`)
}

function contactSheets(video) {
  const pattern = path.join(OUT_DIR, 'launch-sheet-%02d.png')
  run('ffmpeg', ['-loglevel', 'error', '-i', video, '-vf', 'fps=20,scale=240:-1,tile=8x3', pattern])
  return pattern.replace('%02d', '01')
}

async function main() {
  const device = bootedDevice()
  const url = `http://localhost:${PORT}${args.path}`
  const clip = findWebClip(device.udid)
  if (!clip) {
    run('xcrun', ['simctl', 'openurl', 'booted', `http://localhost:${PORT}/sign-in`])
    console.log(`No installed DwellDuel web app on ${device.name}. Install it once:
  1. Start a server on port ${PORT} (e.g. npm run build && npx next start -p ${PORT}); Safari in the simulator is open at it.
  2. Share > View More > Add to Home Screen, keep "Open as Web App" on, tap Add.
Then run this again.`)
    process.exit(2)
  }

  if (!args['skip-build']) run('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
  const app = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], { cwd: ROOT, stdio: 'ignore' })
  const reports = []
  const originalUrl = run('plutil', ['-extract', 'URL', 'raw', clip.plist]).trim()
  let proxy
  let recorder
  try {
    await waitForApp()
    proxy = await startProxy(reports)
    run('plutil', ['-replace', 'URL', '-string', url, clip.plist])

    const video = path.join(OUT_DIR, 'launch.mov')
    // A cold start: terminating fails harmlessly when the web app isn't running.
    try {
      run('xcrun', ['simctl', 'terminate', 'booted', 'com.apple.webapp'], { stdio: 'ignore' })
    } catch {}
    if (args.video) {
      recorder = spawn('xcrun', ['simctl', 'io', 'booted', 'recordVideo', '--codec', 'h264', '--force', video], { stdio: 'ignore' })
      await sleep(1000)
    }
    run('xcrun', ['simctl', 'launch', 'booted', 'com.apple.webapp', '-webClipIdentifier', clip.id])

    const deadline = Date.now() + REPORT_TIMEOUT_MS
    while (reports.length === 0 && Date.now() < deadline) await sleep(250)
    await sleep(1000)
    run('xcrun', ['simctl', 'io', 'booted', 'screenshot', path.join(OUT_DIR, 'page.png')], { stdio: 'ignore' })
    if (recorder) {
      recorder.kill('SIGINT')
      await new Promise((resolve) => recorder.on('exit', resolve))
      console.log(`Launch video: ${video}\nContact sheets: ${contactSheets(video)}`)
    }
    console.log(`Screenshot: ${path.join(OUT_DIR, 'page.png')}`)

    const report = reports[0]
    if (!report) throw new Error(`The installed app never reported from ${url}. Is the web app pointed at localhost:${PORT}?`)
    console.log(JSON.stringify(report, null, 2))
    const problems = []
    if (!report.standalone) problems.push('the page did not run in display-mode: standalone')
    const gap = report.screenHeight - report.innerHeight
    if (gap > TOLERANCE_PT) problems.push(`the viewport is ${gap}pt shorter than the screen (${report.innerHeight} vs ${report.screenHeight})`)
    if (problems.length) {
      console.error(`FAIL on ${device.name}, ${args.path}: ${problems.join('; ')}.`)
      process.exitCode = 1
    } else {
      console.log(`PASS on ${device.name}, ${args.path}: the viewport fills the screen (${report.innerHeight}pt).`)
    }
  } finally {
    run('plutil', ['-replace', 'URL', '-string', originalUrl, clip.plist])
    proxy?.close()
    app.kill()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
