import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { serviceClient } from './helpers'

export interface Member {
  id: string
  email: string
  displayName: string
}

/** An authenticated user who has no profiles row yet — a fresh Google sign-in. */
export async function makeAuthUserWithoutProfile(email: string): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (error) throw error
  return data.user!.id
}

/**
 * Creates a real auth user AND its profile row via the service-role
 * client (bypassing RLS — this is fixture setup, not the thing under
 * test). `on_profile_created` (Task 4) still fires on this insert like
 * any other, so every member returned here already carries the 100-coin
 * starting balance the same code path a real sign-in goes through grants.
 */
export async function makeMember(displayName: string): Promise<Member> {
  const email = `${displayName.toLowerCase()}@example.com`
  const id = await makeAuthUserWithoutProfile(email)
  const db = serviceClient()
  const { error } = await db.from('profiles').insert({ id, email, display_name: displayName })
  if (error) throw error
  return { id, email, displayName }
}

/** Wipes every table this suite touches and every auth user, then creates two fresh members. */
export async function seedMembers(): Promise<[Member, Member]> {
  const db = serviceClient()

  await db.from('coin_transactions').delete().gte('id', 0)
  await db.from('allowed_emails').delete().neq('email', '')
  await db.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { data: existing } = await db.auth.admin.listUsers()
  for (const u of existing.users) await db.auth.admin.deleteUser(u.id)

  const alice = await makeMember('Alice')
  const bob = await makeMember('Bob')
  return [alice, bob]
}

/**
 * A client holding a real session for `email`, subject to RLS. `email`
 * must already belong to an existing auth user — call
 * `makeAuthUserWithoutProfile`/`makeMember` first.
 */
export async function clientForEmail(email: string): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const { data, error } = await serviceClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error) throw error
  const c = createClient(url, anon, { auth: { persistSession: false } })
  const { error: vErr } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (vErr) throw vErr
  return c
}

/** A client acting as the given member, subject to RLS. */
export async function clientFor(member: Member): Promise<SupabaseClient> {
  return clientForEmail(member.email)
}

/**
 * Turns an authenticated test client's session into a real `Cookie`
 * header string, using `@supabase/ssr`'s own cookie adapter — needed by
 * `e2e/global-setup.ts` (Task 9) to inject a real session into a fresh
 * browser context without driving the real Google consent screen.
 */
export async function sessionCookieHeader(client: SupabaseClient): Promise<string> {
  const {
    data: { session },
    error,
  } = await client.auth.getSession()
  if (error) throw error
  if (!session) throw new Error('sessionCookieHeader: client has no session')

  const jar = new Map<string, string>()
  const ssrClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  )
  const { error: setErr } = await ssrClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (setErr) throw setErr

  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}
