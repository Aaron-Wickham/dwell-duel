import { cookies } from 'next/headers'
import { parseSlip, serializeSlip, SLIP_COOKIE, type SlipEntry } from './parse-slip'

export async function readSlip(): Promise<SlipEntry[]> {
  return parseSlip((await cookies()).get(SLIP_COOKIE)?.value)
}

export async function writeSlip(entries: SlipEntry[]): Promise<void> {
  const store = await cookies()
  if (entries.length === 0) {
    store.delete(SLIP_COOKIE)
    return
  }
  store.set(SLIP_COOKIE, serializeSlip(entries), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}
