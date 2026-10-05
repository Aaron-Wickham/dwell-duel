'use client'

import { Fragment, useId } from 'react'
import { AttentionBadge, AttentionNote } from '@/components/ui/attention-badge'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { IntentLink } from '@/components/ui/intent-link'
import { uiTextClass } from '@/components/ui/page'
import { SegmentedControl, segmentClass, segmentMarker } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'

// badge: how many things wait on the viewer behind this tab, drawn as the top bar's badge.
export type SubNavItem = { href: string; label: string; current: boolean; badge?: number }

// The mockup's segmented `.subnav`: full width on a phone, hugging its tabs from md. A
// SegmentedControl of links, with the tab state in the URL; its pill slides between tabs like the
// main nav's does.
export function SubNav({ label, items, className }: { label: string; items: SubNavItem[]; className?: string }) {
  const currentHref = items.find((item) => item.current)?.href
  const noteId = useId()

  return (
    <SegmentedControl as="nav" aria-label={label} activeKey={currentHref} memoryKey={label} className={cn('md:self-start', className)}>
      {items.map(({ href, label: itemLabel, current, badge = 0 }, index) => (
        <Fragment key={href}>
          <IntentLink
            prefetchOnTouch
            href={href}
            transitionTypes={TAB_TRANSITION}
            aria-current={current ? 'page' : undefined}
            aria-describedby={badge > 0 ? `${noteId}-${index}` : undefined}
            {...segmentMarker(current)}
            className={cn(segmentClass(current), uiTextClass, 'grow px-1.5 sm:px-2 md:grow-0 md:px-4')}
          >
            {badge > 0 ? (
              // The badge hangs off the label's corner rather than taking width, so five tabs
              // still fit a phone on one line.
              <span className="relative">
                {itemLabel}
                <AttentionBadge count={badge} className={cn('-top-2.5 -right-4', current ? 'ring-segment-active' : 'ring-sunk')} />
              </span>
            ) : (
              itemLabel
            )}
          </IntentLink>
          {/* Outside the link, so the tab's name stays its label and the count is its description. */}
          <AttentionNote id={`${noteId}-${index}`} count={badge} />
        </Fragment>
      ))}
    </SegmentedControl>
  )
}
