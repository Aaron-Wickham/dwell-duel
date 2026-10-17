'use client'

import { useEffect } from 'react'
import { isTextEntry } from './keyboard-viewport-reset'

// How far the visible height must drop for it to be the on-screen keyboard rather than Safari's
// toolbar collapsing (under 100pt). An iPhone's keyboard takes 250pt or more.
export const KEYBOARD_MIN_HEIGHT = 150

// Whether the on-screen keyboard is up. It opens with a text field's focus and a viewport that has
// shrunk by a keyboard's height; it stays open until the viewport grows back, so the tab bar doesn't
// reappear half way up the screen while the keyboard slides away. Focus alone isn't enough: an iPad
// with a hardware keyboard focuses fields without shrinking anything.
export function nextKeyboardOpen(wasOpen: boolean, fullHeight: number, height: number, textFocused: boolean): boolean {
  const shrunk = fullHeight - height >= KEYBOARD_MIN_HEIGHT
  return shrunk && (wasOpen || textFocused)
}

// On iOS the fixed tab bar and slip button ride up above the keyboard, covering the field and the
// page (#443). While the keyboard is up, <html data-keyboard="open"> hides them (globals.css).
export function KeyboardOpenFlag(): null {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    let open = false
    let width = viewport.width * viewport.scale
    // The tallest the viewport has been at this width, in screen pixels so pinch-zoom doesn't count.
    let fullHeight = viewport.height * viewport.scale
    let frame = 0

    function update() {
      const vv = window.visualViewport!
      const height = vv.height * vv.scale
      const w = vv.width * vv.scale
      if (Math.abs(w - width) > 1) {
        width = w
        fullHeight = height
      }
      fullHeight = Math.max(fullHeight, height)
      open = nextKeyboardOpen(open, fullHeight, height, isTextEntry(document.activeElement))
      if (open) root.dataset.keyboard = 'open'
      else delete root.dataset.keyboard
    }

    // A frame later, so focus moving from one field to the next is judged once it has landed.
    function schedule() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }

    viewport.addEventListener('resize', schedule)
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', schedule)
    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', schedule)
      delete root.dataset.keyboard
    }
  }, [])

  return null
}
