'use client'

import { Moon, Sun } from 'lucide-react'
import { setThemeAction } from '@/lib/theme/set-theme'

function currentTheme(): 'light' | 'dark' {
  const saved = document.documentElement.dataset.theme
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeToggle() {
  function toggle() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    void setThemeAction(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
    >
      <Moon aria-hidden="true" className="size-[22px] dark:hidden" />
      <Sun aria-hidden="true" className="hidden size-[22px] dark:block" />
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:inline">Switch to light theme</span>
    </button>
  )
}
