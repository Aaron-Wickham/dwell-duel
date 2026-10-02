import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { serverActionSettled } from './server-action'

// Reactions on the feed and comments on a market (#79). The seeded session is Alice.

async function createMarket(page: import('@playwright/test').Page, title: string) {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Category', { exact: true }).fill('Testing')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
}

test('a member reacts to a feed item and takes the reaction back', async ({ page }) => {
  const title = 'Will the reactions land?'
  await createMarket(page, title)

  await page.goto('/feed')
  const item = page.getByRole('listitem').filter({ hasText: `Alice opened ${title}` }).first()
  const reactions = item.getByRole('group', { name: 'Reactions' })
  await expect(reactions.getByRole('button', { name: 'React fire, 0 reactions' })).toHaveAttribute('aria-pressed', 'false')

  // Optimistic: the button flips at once; wait for the action before moving on.
  let settled = serverActionSettled(page)
  await reactions.getByRole('button', { name: 'React fire, 0 reactions' }).click()
  const reacted = reactions.getByRole('button', { name: 'React fire, 1 reaction, you reacted' })
  await expect(reacted).toHaveAttribute('aria-pressed', 'true')
  await settled

  await page.reload()
  await expect(reacted).toHaveAttribute('aria-pressed', 'true')

  settled = serverActionSettled(page)
  await reacted.click()
  await expect(reactions.getByRole('button', { name: 'React fire, 0 reactions' })).toHaveAttribute('aria-pressed', 'false')
  await settled

  await page.reload()
  await expect(reactions.getByRole('button', { name: 'React fire, 0 reactions' })).toHaveAttribute('aria-pressed', 'false')
})

test('a member comments on a market and deletes the comment', async ({ page }) => {
  await createMarket(page, 'Will anyone comment?')

  const comments = page.getByRole('region', { name: 'Comments' })
  await expect(comments.getByText('No comments yet.')).toBeVisible()

  const box = comments.getByRole('textbox', { name: 'Add a comment' })
  await box.fill('Yes is a lock')
  await comments.getByRole('button', { name: 'Post comment' }).click()

  const thread = comments.getByRole('list')
  await expect(thread.getByRole('listitem').filter({ hasText: 'Yes is a lock' })).toContainText('Alice (you)')
  await expect(box).toHaveValue('')

  await page.reload()
  await expect(thread.getByRole('listitem').filter({ hasText: 'Yes is a lock' })).toBeVisible()

  await comments.getByRole('button', { name: 'Delete your comment' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete this comment?' })
  await dialog.getByRole('button', { name: 'Delete comment' }).click()

  await expect(comments.getByText('Yes is a lock')).toHaveCount(0)
  await expect(comments.getByText('No comments yet.')).toBeVisible()

  await page.reload()
  await expect(comments.getByText('Yes is a lock')).toHaveCount(0)
})
