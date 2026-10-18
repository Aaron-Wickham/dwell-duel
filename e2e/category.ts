import { expect, type Page } from '@playwright/test'

// Picks a category in a market's Category field (#327), making it when it's new.
export async function chooseCategory(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /^Category\b/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Choose a category' })
  await dialog.getByRole('searchbox', { name: 'Search categories' }).fill(name)
  await dialog
    .getByRole('button', { name, exact: true })
    .or(dialog.getByRole('button', { name: `Create “${name}”`, exact: true }))
    .click()
  await expect(dialog).toBeHidden()
}
