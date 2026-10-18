import { screen, within } from '@testing-library/react'

// Picks a category in a Category field, making it when it's new, as a member taps it in.
// Takes a userEvent.setup() instance or userEvent itself.
export async function chooseCategory(
  user: { click: (element: Element) => Promise<void>; type: (element: Element, text: string) => Promise<void> },
  name: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: /^Category\b/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Choose a category' })
  await user.type(within(dialog).getByRole('searchbox', { name: 'Search categories' }), name)
  const row = within(dialog).queryByRole('button', { name: `Create “${name}”` }) ?? within(dialog).getByRole('button', { name })
  await user.click(row)
}
