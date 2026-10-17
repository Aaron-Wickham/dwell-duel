import { test, expect } from '@playwright/test'
import { makeMember } from '../tests/db/fixtures'
import { serviceClient, setBalanceViaLedger } from '../tests/db/helpers'

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
  await expect(page.getByRole('region', { name: 'Bob’s coin movements' }).getByRole('listitem').getByText('Starting grant')).toBeVisible()
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
  await expect(removed.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })).toContainText('Removed')
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

// #418: the headers sort the table, and the order lives in the URL.
test('the owner sorts members by balance, both ways, from the column header', async ({ page }) => {
  await page.goto('/admin/members')
  const members = page.getByRole('region', { name: 'Members' })
  const balanceHeader = members.locator('th', { has: page.getByRole('link', { name: /^Balance, sort/ }) })
  await members.getByRole('link', { name: 'Balance, sort highest balance first' }).click()
  await expect(page).toHaveURL(/\/admin\/members\?sort=balance$/)
  await expect(balanceHeader).toHaveAttribute('aria-sort', 'descending')

  await members.getByRole('link', { name: 'Balance, sort lowest balance first' }).click()
  await expect(page).toHaveURL(/\/admin\/members\?sort=balance&dir=asc$/)
  await expect(balanceHeader).toHaveAttribute('aria-sort', 'ascending')
  const balances = await members
    .getByRole('row')
    .evaluateAll((rows) => rows.slice(1).map((row) => Number(row.querySelectorAll('[role="cell"]')[2]?.textContent?.replace(/[^\d-]/g, ''))))
  expect(balances.length).toBeGreaterThan(1)
  expect(balances).toEqual([...balances].sort((a, b) => a - b))
})

// #429: the Removed tab sorts by net worth too, highest first, turning round on a second tap.
test('the owner sorts removed members by net worth, both ways', async ({ page }) => {
  const tag = Date.now() % 1_000_000
  // Made with no invite, so both are removed members from the start.
  const rich = await makeMember(`GoneRich${tag}`)
  const poor = await makeMember(`GonePoor${tag}`)
  await setBalanceViaLedger(rich.id, 900)
  await setBalanceViaLedger(poor.id, 20)

  await page.goto('/admin/members?show=removed')
  const removed = page.getByRole('region', { name: 'Removed members' })
  const header = removed.locator('th', { has: page.getByRole('link', { name: /^Net worth, sort/ }) })
  const order = async () => {
    const rows = await removed.getByRole('row').evaluateAll((all) =>
      all.slice(1).map((row) => ({
        name: row.querySelector('a')?.textContent ?? '',
        worth: Number(row.querySelectorAll('[role="cell"]')[3]?.textContent?.replace(/[^\d-]/g, '')),
      })),
    )
    const names = rows.map((r) => r.name)
    return { worths: rows.map((r) => r.worth), rich: names.indexOf(rich.displayName), poor: names.indexOf(poor.displayName) }
  }

  await removed.getByRole('link', { name: 'Net worth, sort highest net worth first' }).click()
  await expect(page).toHaveURL(/\/admin\/members\?show=removed&sort=net_worth$/)
  await expect(header).toHaveAttribute('aria-sort', 'descending')
  const highest = await order()
  expect(highest.worths).toEqual([...highest.worths].sort((a, b) => b - a))
  expect(highest.rich).toBeGreaterThanOrEqual(0)
  expect(highest.rich).toBeLessThan(highest.poor)

  await removed.getByRole('link', { name: 'Net worth, sort lowest net worth first' }).click()
  await expect(page).toHaveURL(/\/admin\/members\?show=removed&sort=net_worth&dir=asc$/)
  await expect(header).toHaveAttribute('aria-sort', 'ascending')
  const lowest = await order()
  expect(lowest.worths).toEqual([...lowest.worths].sort((a, b) => a - b))
  expect(lowest.poor).toBeGreaterThanOrEqual(0)
  expect(lowest.poor).toBeLessThan(lowest.rich)
})
