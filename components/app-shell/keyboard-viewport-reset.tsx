'use client'

import { useEffect } from 'react'

// Long enough for iOS's keyboard to finish sliding away before the page is asked to re-measure.
export const KEYBOARD_SETTLE_MS = 300

function isTextEntry(element: Element | null): boolean {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLElement && element.isContentEditable) return true
  if (!(element instanceof HTMLInputElement)) return false
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type)
}

// In the installed iPhone app the keyboard shrinks the layout viewport, and the fixed status band,
// top bar and tab bar move up with it. iOS sometimes leaves them there after the keyboard goes
// away -- most often when a tap navigates while a field still has focus, so no blur ever fires --
// and the tab bar then floats about a keyboard's height up the page (#350). A one-pixel scroll
// round trip makes WebKit lay them out against the restored viewport; it lands in a single frame,
// so nothing visibly moves. Only the installed app needs it: Safari's own chrome takes the keyboard.
export function KeyboardViewportReset(): null {
  useEffect(() => {
    if (!window.matchMedia('(display-mode: standalone)').matches) return
    let timer: number | undefined

    function settle() {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (isTextEntry(document.activeElement)) return
        const top = window.scrollY
        window.scrollTo({ top: top + 1, behavior: 'instant' })
        window.scrollTo({ top, behavior: 'instant' })
      }, KEYBOARD_SETTLE_MS)
    }

    const viewport = window.visualViewport
    document.addEventListener('focusout', settle)
    viewport?.addEventListener('resize', settle)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusout', settle)
      viewport?.removeEventListener('resize', settle)
    }
  }, [])

  return null
}
