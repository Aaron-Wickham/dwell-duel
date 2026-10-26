import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const { error } = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error } }))

import { ERROR_TOAST_DURATION_MS, toastError } from '@/lib/toast/error-toast'

const root = path.resolve(import.meta.dirname, '../../..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('toastError', () => {
  it('keeps an error on screen for 10 seconds', () => {
    toastError('That didn’t go through.')
    expect(ERROR_TOAST_DURATION_MS).toBe(10_000)
    expect(error).toHaveBeenCalledWith('That didn’t go through.', { duration: 10_000 })
  })

  it('is the only way the app shows an error toast', () => {
    const direct = ['app', 'components', 'lib']
      .flatMap((dir) => sourceFiles(path.join(root, dir)))
      .filter((file) => readFileSync(file, 'utf8').includes('toast.error('))
      .map((file) => path.relative(root, file))
    expect(direct).toEqual([path.join('lib', 'toast', 'error-toast.ts')])
  })
})
