import { cookies } from 'next/headers'
import { MAX_PICKS } from './odds'
import { parseSlip, SLIP_COOKIE } from './parse-slip'

export async function readSlip(): Promise<string[]> {
  return parseSlip((await cookies()).get(SLIP_COOKIE)?.value)
}

export async function writeSlip(outcomeIds: string[]): Promise<void> {
  const store = await cookies()
  if (outcomeIds.length === 0) {
    store.delete(SLIP_COOKIE)
    return
  }
  store.set(SLIP_COOKIE, JSON.stringify(outcomeIds.slice(0, MAX_PICKS)), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}
