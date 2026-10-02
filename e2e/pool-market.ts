import type { Page } from '@playwright/test'
import { clientForEmail, createPoolMarket } from '../tests/db/fixtures'

// Create market makes an LMSR market since 0102, whose bets are final. A spec about cancelling,
// removing or pool payouts needs a pool market, which only the previous build's create_market
// still makes: the signed-in member makes one through it, and the page opens it.
export async function openPoolMarket(page: Page, title: string, labels = ['Yes', 'No']): Promise<string> {
  const alice = await clientForEmail('alice@example.com')
  const { data, error } = await createPoolMarket(alice, {
    p_title: title,
    p_description: null,
    p_kind: labels.length === 2 && labels[0] === 'Yes' ? 'binary' : 'multiple_choice',
    p_outcome_labels: labels,
    p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  if (error) throw error
  const path = `/markets/${data}`
  await page.goto(path)
  return path
}
