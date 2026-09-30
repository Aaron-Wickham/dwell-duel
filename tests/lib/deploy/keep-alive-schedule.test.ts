import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'))

// settle_season (0051) defaults to the month before today's Eastern date, and the keep-alive cron
// is what calls it. Midnight UTC is still the previous evening in Eastern time (20:00 EDT, 19:00
// EST), so a run then settles the month before last, a no-op, and the champion only posted a day
// late (#197). Any hour from 05:00 UTC is past midnight Eastern under both EST (UTC-5) and EDT
// (UTC-4), so the champion is posted early on the 1st.
describe('keep-alive schedule', () => {
  it('runs once a day, after midnight Eastern in both EST and EDT', () => {
    const keepAlive = vercel.crons.find((c: { path: string }) => c.path === '/api/cron/keep-alive')
    const [minute, hour, dayOfMonth, month, dayOfWeek] = keepAlive.schedule.split(' ')
    expect([dayOfMonth, month, dayOfWeek]).toEqual(['*', '*', '*'])
    expect(Number(minute)).toBeGreaterThanOrEqual(0)
    expect(Number(hour)).toBeGreaterThanOrEqual(5)
    expect(Number(hour)).toBeLessThan(24)
  })
})
