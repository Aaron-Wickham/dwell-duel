import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import { seedMembers, clientFor, ensureInvited } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'
setTimeout(() => { console.log('timed out'); process.exit(1) }, 45000)
;(async () => {
  const [alice, bob] = await seedMembers()
  const bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
  await ensureInvited(await clientFor(alice))
  const { data: { session } } = await bobClient.auth.getSession()
  bobClient.realtime.setAuth(session!.access_token)
  const got: unknown[] = []
  const ch = bobClient.channel('t').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => got.push(p))
  await new Promise<void>((res) => ch.subscribe((s, err) => { if (s === 'SUBSCRIBED') res(); else console.log('status', s, err?.message ?? '') }))
  await new Promise((r) => setTimeout(r, 1500))
  await serviceClient().from('profiles').update({ balance: 555 }).eq('id', bob.id)
  await serviceClient().from('profiles').update({ balance: 444 }).eq('id', alice.id)
  await new Promise((r) => setTimeout(r, 4000))
  console.log('events:', got.length)
  for (const e of got as { new: Record<string, unknown> }[]) console.log(JSON.stringify({ who: e.new.id === bob.id ? 'bob' : 'alice', balance: e.new.balance, hasEmail: 'email' in e.new }))
  process.exit(0)
})()
