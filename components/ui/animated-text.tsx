import type { ReactNode } from 'react'

// NumberFlow's own light DOM is either its static server-rendered fallback text, or
// nothing at all once it upgrades into a real shadow root, so it's never a reliable
// place for Playwright's getByText or an assistive-technology reader to look. Every
// animated number keeps this exact plain-text twin instead: real content for screen
// readers and e2e, with the animated copy hidden from both so it isn't seen or
// announced twice.
export function AnimatedText({
  plainText,
  className,
  children,
}: {
  plainText: string
  className?: string
  children: ReactNode
}) {
  return (
    <>
      <span className="sr-only">{plainText}</span>
      <span aria-hidden="true" className={className}>
        {children}
      </span>
    </>
  )
}
