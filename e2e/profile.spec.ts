import { test, expect } from '@playwright/test'
import { makeMember, clientFor, sessionCookieHeader } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// Its own throwaway member, so renaming never touches the Alice and Bob other specs look for. The
// suffix keeps a retry from colliding with the first attempt's member.
test('edit your display name, bio and photo', async ({ browser }) => {
  const suffix = Date.now().toString(36)
  const member = await makeMember(`Editor${suffix}`)
  const db = serviceClient()
  const { error: inviteErr } = await db.from('allowed_emails').insert({ email: member.email, claimed_by: member.id })
  if (inviteErr) throw inviteErr

  const cookieHeader = await sessionCookieHeader(await clientFor(member))
  const context = await browser.newContext()
  await context.addCookies(
    cookieHeader.split('; ').map((pair) => {
      const [name, ...rest] = pair.split('=')
      return { name, value: rest.join('='), domain: 'localhost', path: '/' }
    }),
  )
  const page = await context.newPage()

  await page.goto('/profile')
  await expect(page.getByText('Without a photo, your initial shows instead.')).toBeVisible()
  await page.getByLabel('Display name').fill(`Priscilla ${suffix}`)
  await page.getByLabel('Bio').fill('Tea after the late service.')
  await page.locator('#pf-photo').setInputFiles('public/android-chrome-192.png')
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Profile saved.').first()).toBeVisible()

  const { data: saved, error } = await db.from('profiles').select('display_name, bio, avatar_path').eq('id', member.id).single()
  if (error) throw error
  expect(saved).toMatchObject({ display_name: `Priscilla ${suffix}`, bio: 'Tea after the late service.' })
  expect(saved.avatar_path).toMatch(new RegExp(`^${member.id}/[0-9a-f-]+\\.jpg$`))

  await page.goto(`/members/${member.id}`)
  await expect(page.getByRole('heading', { level: 1, name: `Priscilla ${suffix}` })).toBeVisible()
  await expect(page.getByText('Tea after the late service.')).toBeVisible()
  const photo = page.locator(`main img[src$="/avatars/${saved.avatar_path}"]`)
  await expect(photo).toBeVisible()
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512)

  // Removing the photo deletes the stored file too.
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Remove photo' }).click()
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Without a photo, your initial shows instead.')).toBeVisible()
  await expect(page.getByText('Profile saved.').first()).toBeVisible()
  await expect
    .poll(async () => (await db.from('profiles').select('avatar_path').eq('id', member.id).single()).data?.avatar_path)
    .toBeNull()
  const { data: files } = await db.storage.from('avatars').list(member.id)
  expect(files ?? []).toHaveLength(0)

  await context.close()
})
