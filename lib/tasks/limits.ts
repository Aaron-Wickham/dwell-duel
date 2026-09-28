// supabase/migrations/0046's tasks_reward_amount_max CHECK enforces the same cap.
export const MAX_TASK_REWARD = 500

export function rewardError(rewardAmount: number): string | null {
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) return 'Enter a whole number of DC greater than 0.'
  if (rewardAmount > MAX_TASK_REWARD) return `A task can reward at most ${MAX_TASK_REWARD} DC.`
  return null
}
