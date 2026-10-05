import { test, expect } from '@playwright/test'
import { PAGE_SIZE } from '../lib/pagination/cursor'
import { serviceClient } from '../tests/db/helpers'

test('the review queue pages oldest first, with Show more, and the waiting count covers the whole queue', async ({ page }) => {
  const db = serviceClient()
  const { data: bob, error } = await db.from('profiles').select('id').eq('display_name', 'Bob').single()
  if (error) throw error
  const { data: task, error: taskErr } = await db
    .from('tasks')
    .insert({ title: 'Queue paging check', reward_amount: 1, is_repeatable: true, period: 'daily', created_by: bob.id })
    .select('id')
    .single()
  if (taskErr) throw taskErr

  // Dated 2020, so they sort ahead of any submission another spec leaves pending.
  const total = PAGE_SIZE + 5
  try {
    const { error: insertErr } = await db.from('task_completions').insert(
      Array.from({ length: total }, (_, i) => ({
        task_id: task.id,
        profile_id: bob.id,
        status: 'pending',
        reward_amount: 1,
        period_key: `q${String(i).padStart(2, '0')}`,
        note: `Queue check ${String(i).padStart(2, '0')}`,
        submitted_at: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString(),
      })),
    )
    if (insertErr) throw insertErr

    await page.goto('/admin/tasks')
    const queue = page.getByRole('region', { name: 'To review' })
    // The queue is a table (#399), and each note sits in its row's Proof cell.
    const row = (n: string) => queue.getByRole('row').filter({ hasText: `Queue check ${n}` })
    await expect(row('00')).toBeVisible()
    await expect(row(String(PAGE_SIZE - 1))).toBeVisible()
    await expect(row(String(PAGE_SIZE))).toHaveCount(0)
    // The signed-in owner reviews Bob's rows (never their own, 0046). The badge counts past the page.
    // A row's button is "Approve <name>'s <task>"; this skips "Approve selected".
    await expect(queue.getByRole('button', { name: /^Approve(?! selected)/ }).first()).toBeVisible()
    // Everything pending that isn't the owner's own, not just the page on screen.
    const { data: owner, error: ownerErr } = await db.from('profiles').select('id').eq('display_name', 'Alice').single()
    if (ownerErr) throw ownerErr
    const { count, error: countErr } = await db
      .from('task_completions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .neq('profile_id', owner.id)
    if (countErr) throw countErr
    expect(count).toBeGreaterThan(PAGE_SIZE)
    await expect(queue.getByText(`${count} waiting`)).toBeVisible()

    await queue.getByRole('link', { name: 'Show more' }).click()
    await expect(row(String(total - 1))).toBeVisible()
    await expect(row('00')).toBeVisible()
    await expect(queue.getByRole('link', { name: 'Show more' })).toHaveCount(0)
  } finally {
    await db.from('task_completions').delete().eq('task_id', task.id)
    await db.from('tasks').delete().eq('id', task.id)
  }
})
