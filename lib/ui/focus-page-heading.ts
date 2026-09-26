// An overlay's own trigger can be gone by the time it closes -- an emptied slip drawer or a
// voided market's page both unmount the element that opened them. The page's <h1> is the one
// heading guaranteed to still be there; it isn't natively focusable, so this makes it so first.
export function focusPageHeading(): HTMLElement | null {
  const heading = document.querySelector('h1')
  if (!heading) return null
  heading.tabIndex = -1
  return heading
}
