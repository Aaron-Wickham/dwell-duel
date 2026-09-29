export interface PushPayload {
  title: string
  body: string
  url: string
}

// Every notification says who it's from and nothing private: the body is what the member already
// sees in the app.
const TITLE = 'DwellDuel'

const payload = (body: string, url: string): PushPayload => ({ title: TITLE, body, url })

export function resolveReminderPayload(market: { marketId: string; title: string }): PushPayload {
  return payload(`${market.title} has closed. Please resolve it.`, `/markets/${market.marketId}`)
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
    return payload(row.hasSolo ? `${title} was voided, your stake is refunded` : `${title} was voided and dropped from your parlay`, url)
  }
  const result = row.isOverride ? `${title} changed to ${row.outcomeLabel}` : `${title} resolved: ${row.outcomeLabel}`
  if (row.hasSolo && row.won > 0) {
    return payload(row.isOverride ? `${result}. You won ${row.won} DC` : `You won ${row.won} DC on ${title}`, url)
  }
  if (row.hasSolo && row.refunded > 0) return payload(`${result}, your stake is refunded`, url)
  return payload(result, url)
}

export interface TaskReviewRow {
  taskTitle: string
  status: string
  rewardAmount: number
  reviewNote: string | null
}

export function taskReviewPayload(row: TaskReviewRow): PushPayload {
  const task = `Your task “${row.taskTitle}”`
  if (row.status === 'approved') return payload(`${task} was approved: +${row.rewardAmount} DC`, '/tasks')
  const reason = row.reviewNote?.trim()
  return payload(reason ? `${task} was rejected: ${reason}` : `${task} was rejected`, '/tasks')
}

export function newMarketPayload(market: { marketId: string; title: string }): PushPayload {
  return payload(`New market: ${market.title}`, `/markets/${market.marketId}`)
}
