import { test, expect } from '@playwright/test'
import { makeMember } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// #254 and #265, as the owner (e2e/global-setup.ts makes Alice the owner).

async function bobId(): Promise<string> {
  const { data, error } = await serviceClient().from('profiles').select('id').eq('email', 'bob@example.com').single()
  if (error) throw error
  return data.id
}

test('the owner finds a member by searching, by name or email', async ({ page }) => {
  await page.goto('/admin/members')
  const members = page.getByRole('region', { name: 'Members' })
  await expect(members.getByRole('link', { name: 'Alice', exact: true })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search members' }).fill('BOB@exam')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/admin\/members\?q=BOB%40exam$/)
  await expect(page.getByText('1 member matches “BOB@exam”.')).toBeVisible()
  await expect(members.getByRole('link', { name: 'Bob', exact: true })).toBeVisible()
  await expect(members.getByRole('link', { name: 'Alice', exact: true })).toHaveCount(0)

  await page.getByRole('link', { name: 'Clear search' }).click()
  await expect(page).toHaveURL(/\/admin\/members$/)
  await expect(members.getByRole('link', { name: 'Alice', exact: true })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search members' })).toHaveValue('')
})

test('a member’s row opens their Admin page, which links to their movements in the ledger', async ({ page }) => {
  const id = await bobId()
  await page.goto('/admin/members')
  await page.getByRole('region', { name: 'Members' }).getByRole('link', { name: 'Bob', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`/admin/members/${id}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Bob' })).toBeVisible()
  await expect(page.getByText('bob@example.com')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Adjust balance' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Access' }).getByRole('button', { name: 'Remove Bob from DwellDuel' })).toBeVisible()

  await page.getByRole('region', { name: 'Coin history' }).getByRole('link', { name: 'Open in Ledger' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/ledger\\?member=${id}$`))
  await expect(page.getByText('Showing Bob’s coin movements.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Bob’s coin movements' }).getByText('Starting grant')).toBeVisible()
})

test('an unknown member id is a real 404', async ({ page }) => {
  const response = await page.goto('/admin/members/00000000-0000-4000-8000-000000000000')
  expect(response?.status()).toBe(404)
})

test('a removed member is marked, left off the leaderboard, and can be invited again', async ({ page }) => {
  const name = `Leaver${Date.now() % 1_000_000}`
  const leaver = await makeMember(name)
  const { error } = await serviceClient().from('allowed_emails').insert({ email: leaver.email, claimed_by: leaver.id })
  if (error) throw error

  await page.goto('/leaderboard')
  await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible()

  await page.goto(`/admin/members/${leaver.id}`)
  await page.getByRole('button', { name: `Remove ${name} from DwellDuel` }).click()
  await page.getByRole('alertdialog', { name: `Remove ${name} from DwellDuel?` }).getByRole('button', { name: 'Remove member' }).click()
  const access = page.getByRole('region', { name: 'Access' })
  await expect(access.getByRole('button', { name: `Invite ${name} again` })).toBeVisible()
  await expect(page.getByText('Removed', { exact: true })).toBeVisible()

  await page.goto('/admin/members?show=removed')
  const removed = page.getByRole('region', { name: 'Removed members' })
  await expect(removed.getByRole('listitem').filter({ has: page.getByRole('link', { name, exact: true }) })).toContainText('Removed')
  await page.goto('/admin/members')
  await expect(page.getByRole('region', { name: 'Members' }).getByRole('link', { name, exact: true })).toHaveCount(0)

  await page.goto('/leaderboard')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0)

  // Inviting them back asks first.
  await page.goto(`/admin/members/${leaver.id}`)
  await page.getByRole('button', { name: `Invite ${name} again` }).click()
  await page.getByRole('alertdialog', { name: `Invite ${name} again?` }).getByRole('button', { name: 'Invite again' }).click()
  await expect(page.getByRole('region', { name: 'Access' }).getByRole('button', { name: `Remove ${name} from DwellDuel` })).toBeVisible()
  await expect(page.getByText('Removed', { exact: true })).toHaveCount(0)
})
