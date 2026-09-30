import { test, expect } from '@playwright/test'
import { serviceClient } from '../tests/db/helpers'

test('the review queue pages oldest first, with Show more, and the waiting count covers the whole queue', async ({ page }) => {
  const db = serviceClient()
  const { data: alice, error } = await db.from('profiles').select('id').eq('display_name', 'Alice').single()
  if (error) throw error
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .insert({ title: 'Queue paging check', reward_amount: 1, is_repeatable: true, period: 'daily', created_by: alice.id })
    .select('id')
    .single()
  if (taskErr) throw taskErr

  // Dated 2020, so they sort ahead of any submission another spec leaves pending.
  const total = 55
  const { error: insertErr } = await db.from('task_completions').insert(
    Array.from({ length: total }, (_, i) => ({
      task_id: task.id,
      profile_id: alice.id,
      status: 'pending',
      reward_amount: 1,
      period_key: `q${String(i).padStart(2, '0')}`,
      note: `Queue check ${String(i).padStart(2, '0')}`,
      submitted_at: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString(),
    })),
  )
  if (insertErr) throw insertErr

  try {
    await page.goto('/admin/tasks')
    const queue = page.getByRole('region', { name: 'Pending approvals' })
    const row = (n: string) => queue.getByRole('listitem').filter({ hasText: `Queue check ${n}` })
    await expect(row('00')).toBeVisible()
    await expect(row('49')).toBeVisible()
    await expect(row('50')).toHaveCount(0)
    // The first button named Approve is still a row's, and the badge counts past the page.
    await expect(queue.getByRole('button', { name: 'Approve' }).first()).toBeVisible()
    await expect(queue.getByText(/\d+ waiting/)).toBeVisible()

    await queue.getByRole('link', { name: 'Show more' }).click()
    await expect(row('54')).toBeVisible()
    await expect(row('00')).toBeVisible()
    await expect(queue.getByRole('link', { name: 'Show more' })).toHaveCount(0)
  } finally {
    await db.from('task_completions').delete().eq('task_id', task.id)
    await db.from('tasks').delete().eq('id', task.id)
  }
})
