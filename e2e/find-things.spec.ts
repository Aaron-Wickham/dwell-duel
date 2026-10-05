import { test, expect, type Page } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { placeSolo } from './slip'
import { makeMember } from '../tests/db/fixtures'
import { deleteAuthUser, serviceClient } from '../tests/db/helpers'

async function createMarket(page: Page, title: string, category = 'Testing') {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Category', { exact: true }).fill(category)
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 2 * 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+$/)
}

test('markets search by title, narrow to a category, and clear', async ({ page }) => {
  const word = `Zanzibar${Date.now()}`
  const title = `${word} potluck headcount`
  const category = `Find ${Date.now() % 1_000_000}`
  await createMarket(page, title, category)

  await page.goto('/markets')
  const box = page.getByRole('searchbox', { name: 'Search markets by title' })
  await box.fill(word.toLowerCase())
  await box.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/markets\\?q=${word.toLowerCase()}$`))
  await expect(page.getByRole('link', { name: title })).toBeVisible()
  await expect(page.getByText(`1 market matches “${word.toLowerCase()}”.`)).toBeVisible()

  // Wildcards typed into the search are text, so they find nothing here rather than everything.
  await box.fill('%')
  await box.press('Enter')
  await expect(page.getByText('No markets match “%”.')).toBeVisible()
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)

  await page.getByRole('link', { name: 'Clear search' }).click()
  await expect(page).toHaveURL(/\/markets$/)
  await expect(box).toHaveValue('')

  await box.fill(word)
  await box.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/markets\\?q=${word}$`))
  // A category chip narrows the search, and the choice lives in the URL (#327).
  const chips = page.getByRole('navigation', { name: 'Categories' })
  await chips.getByRole('link', { name: category }).click()
  await expect(page).toHaveURL(new RegExp(`q=${word}&category=${category.toLowerCase().replace(' ', '-')}$`))
  await expect(chips.getByRole('link', { name: category })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(`Showing markets in ${category}`)).toBeVisible()
  await expect(page.getByRole('article').filter({ hasText: title })).toContainText(category)
  await chips.getByRole('link', { name: 'All', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/markets\\?q=${word}$`))

  // Links to the removed whose-markets chips fall through to every market.
  await page.goto(`/markets?q=${word}&mine=made`)
  await expect(page.getByRole('navigation', { name: 'Whose markets' })).toHaveCount(0)
  await page.getByRole('link', { name: title }).click()
  await placeSolo(page, 'Yes', 5)

  // The feed: the bet is Alice's own event, so Mine has it, and Results (settlements only) doesn't.
  const sentence = `Alice bet 5 DC on Yes in ${title}`
  await page.goto('/feed')
  await expect(page.getByRole('listitem').filter({ hasText: sentence })).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'Show' })
  await tabs.getByRole('link', { name: 'Mine' }).click()
  await expect(page).toHaveURL(/\/feed\?show=mine$/)
  await expect(tabs.getByRole('link', { name: 'Mine' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('listitem').filter({ hasText: sentence })).toBeVisible()
  await tabs.getByRole('link', { name: 'Results' }).click()
  await expect(page).toHaveURL(/\/feed\?show=results$/)
  await expect(page.getByRole('listitem').filter({ hasText: sentence })).toHaveCount(0)
})

test.describe('Jump to me', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.setTimeout(90_000)

  const extras: string[] = []
  const extraEmails: string[] = []

  test.beforeAll(async () => {
    const db = serviceClient()
    // More than a page (50) of members ahead of Alice, so her row is not on the first one.
    for (let i = 0; i < 56; i += 8) {
      const batch = await Promise.all(
        Array.from({ length: 8 }, async (_, j) => {
          const member = await makeMember(`Jumper${String(i + j).padStart(2, '0')}`)
          const { error } = await db.from('profiles').update({ balance: 1_000_000 + i + j }).eq('id', member.id)
          if (error) throw error
          // Only invited members are ranked (0093).
          const { error: inviteErr } = await db
            .from('allowed_emails')
            .upsert({ email: member.email.toLowerCase(), claimed_by: member.id }, { onConflict: 'email' })
          if (inviteErr) throw inviteErr
          extraEmails.push(member.email.toLowerCase())
          return member.id
        }),
      )
      extras.push(...batch)
    }
  })

  test.afterAll(async () => {
    const db = serviceClient()
    await db.from('allowed_emails').delete().in('email', extraEmails)
    await db.from('profiles').delete().in('id', extras)
    for (const id of extras) await deleteAuthUser(db, id)
  })

  test('a member far down the board jumps to their own row, and goes back to the top', async ({ page }) => {
    await page.goto('/leaderboard')
    const card = page.getByRole('region', { name: 'Your rank' })
    await expect(card).toBeVisible()
    await expect(card.getByText('You', { exact: true })).toBeVisible()
    // Alice is behind all fifty-six, so her row is past the first page.
    await expect(page.getByRole('listitem').filter({ hasText: '(you)' })).toHaveCount(0)

    await card.getByRole('link', { name: 'Jump to me' }).click()
    await expect(page).toHaveURL(/\/leaderboard\?at=me$/)
    const mine = page.getByRole('listitem').filter({ hasText: '(you)' })
    await expect(mine).toBeVisible()
    await expect(mine).toBeFocused()
    await expect(page.getByText(/^Showing ranks \d+–\d+$/)).toBeVisible()

    await page.getByRole('link', { name: 'Back to the top' }).click()
    await expect(page).toHaveURL(/\/leaderboard$/)
    await expect(page.getByRole('listitem').filter({ hasText: '(you)' })).toHaveCount(0)
  })
})
