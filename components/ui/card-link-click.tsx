'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"]'

// Under a mouse, `stretched-link` drops its cover so a card's text can be selected, so the card's
// click is handled here instead, for every card at once: one listener, not one per server-rendered card.
// The card carries data-card-pending until its page arrives, which globals.css dims as it does a
// tapped link's card (#384).
export function CardLinkClick() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const pendingCard = useRef<Element | null>(null)

  useEffect(() => {
    if (pending) return
    pendingCard.current?.removeAttribute('data-card-pending')
    pendingCard.current = null
  }, [pending])

  useEffect(() => {
    const mouse = window.matchMedia('(pointer: fine)')

    function open(event: MouseEvent) {
      if (!mouse.matches || event.defaultPrevented) return
      const target = event.target
      if (!(target instanceof Element) || target.closest(INTERACTIVE)) return
      const middle = event.type === 'auxclick'
      if (event.button !== (middle ? 1 : 0)) return

      const card = target.closest('.pressable')
      const link = card?.querySelector<HTMLAnchorElement>('a.stretched-link')
      if (!card || !link) return

      // A drag that finishes a selection inside the card ends in a click; the selection wins.
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed && (card.contains(selection.anchorNode) || card.contains(selection.focusNode))) return

      if (middle || event.metaKey || event.ctrlKey) {
        event.preventDefault()
        window.open(link.href, '_blank')
      } else {
        pendingCard.current?.removeAttribute('data-card-pending')
        card.setAttribute('data-card-pending', '')
        pendingCard.current = card
        startTransition(() => router.push(link.getAttribute('href')!, { transitionTypes: ['nav-forward'] }))
      }
    }

    document.addEventListener('click', open)
    document.addEventListener('auxclick', open)
    return () => {
      document.removeEventListener('click', open)
      document.removeEventListener('auxclick', open)
    }
  }, [router])

  return null
}
