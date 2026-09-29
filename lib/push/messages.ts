export interface PushPayload {
  title: string
  body: string
  url: string
}

// The OS already names the app above every notification, so the title says what happened and the
// body carries the detail. Nothing private: the body is what the member already sees in the app.

export function resolveReminderPayload(market: { marketId: string; title: string }): PushPayload {
  return { title: 'Time to resolve', body: `${market.title} has closed`, url: `/markets/${market.marketId}` }
}

// Sent to reviewers and above when a member submits a task, and to admins and above once a market
// has closed with no result.
export function taskAlertPayload(row: { taskTitle: string; submitterName: string }): PushPayload {
  return { title: 'Task to review', body: `${row.submitterName}: ${row.taskTitle}`, url: '/admin/tasks' }
}

export function marketAlertPayload(market: { marketId: string; title: string }): PushPayload {
  return { title: 'Market needs a result', body: `${market.title} has closed`, url: `/markets/${market.marketId}` }
}

export interface MarketResultRow {
  title: string
  status: string
  outcomeLabel: string | null
  isOverride: boolean
  won: number
  refunded: number
  hasSolo: boolean
}

// A parlay settles only once all its legs have, so a member holding only a parlay leg hears that
// the market resolved, never a win or loss.
export function marketResultPayload(marketId: string, row: MarketResultRow): PushPayload {
  const url = `/markets/${marketId}`
  const { title } = row
  if (row.status === 'voided') {
    const body = row.hasSolo ? `${title}: your stake is refunded` : `${title} was dropped from your parlay`
    return { title: 'Market voided', body, url }
  }
  const result = row.isOverride ? `${title} changed to ${row.outcomeLabel}` : `${title}: ${row.outcomeLabel}`
  if (row.hasSolo && row.won > 0) return { title: `You won ${row.won} DC`, body: result, url }
  const heading = row.isOverride ? 'Result changed' : 'Market resolved'
  if (row.hasSolo && row.refunded > 0) return { title: heading, body: `${result}. Your stake is refunded`, url }
  return { title: heading, body: result, url }
}

export interface TaskReviewRow {
  taskTitle: string
  status: string
  rewardAmount: number
  reviewNote: string | null
}

export function taskReviewPayload(row: TaskReviewRow): PushPayload {
  if (row.status === 'approved') {
    return { title: 'Task approved', body: `${row.taskTitle}: +${row.rewardAmount} DC`, url: '/tasks' }
  }
  const reason = row.reviewNote?.trim()
  return { title: 'Task not approved', body: reason ? `${row.taskTitle}: ${reason}` : row.taskTitle, url: '/tasks' }
}

export function newMarketPayload(market: { marketId: string; title: string }): PushPayload {
  return { title: 'New market', body: market.title, url: `/markets/${market.marketId}` }
}
