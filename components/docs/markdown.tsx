import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, Inline } from '@/lib/docs/markdown'
import { uiTextClass, rowTitleClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'

// A doc is written for the repo, so a link to another file in it has nowhere to go in the app
// and keeps only its text. App paths and web addresses stay links.
function linkKind(href: string): 'app' | 'web' | 'text' {
  if (href.startsWith('/')) return 'app'
  if (/^(https?:|mailto:|#)/.test(href)) return 'web'
  return 'text'
}

// The doc's own anchors are GitHub's `#the-leaderboard`; the page gives each section the id
// `how-<slug>` (app/(app)/how-it-works/rules/page.tsx), so an in-doc link is pointed at that.
export const SECTION_ID_PREFIX = 'how-'

function pageHref(href: string): string {
  return href.startsWith('#') && !href.startsWith(`#${SECTION_ID_PREFIX}`) ? `#${SECTION_ID_PREFIX}${href.slice(1)}` : href
}

export function InlineContent({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text
      case 'strong':
        return (
          <strong key={i} className="font-extrabold">
            <InlineContent nodes={node.children} />
          </strong>
        )
      case 'em':
        return (
          <em key={i}>
            <InlineContent nodes={node.children} />
          </em>
        )
      case 'code':
        return (
          <code key={i} className="rounded-segment bg-sunk px-1 py-0.5 text-[0.9em]">
            {node.text}
          </code>
        )
      case 'link': {
        const kind = linkKind(node.href)
        const children = <InlineContent nodes={node.children} />
        if (kind === 'app') {
          return (
            <Link key={i} href={node.href}>
              {children}
            </Link>
          )
        }
        if (kind === 'web') {
          return (
            <a key={i} href={pageHref(node.href)}>
              {children}
            </a>
          )
        }
        return <span key={i}>{children}</span>
      }
    }
  })
}

const cellClass = 'border-b border-line py-2.5 pr-3 align-top last:pr-0'

function BlockContent({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading':
      // h1 and h2 are taken by the page and its sections, so anything deeper sits below them.
      return (
        <h3 className={cn(rowTitleClass, 'mt-1')}>
          <InlineContent nodes={block.children} />
        </h3>
      )
    case 'paragraph':
      return (
        <p>
          <InlineContent nodes={block.children} />
        </p>
      )
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul'
      return (
        <List className={`flex flex-col gap-2 pl-5 marker:text-ink2 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              <InlineContent nodes={item} />
            </li>
          ))}
        </List>
      )
    }
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className={`w-full border-collapse text-left ${uiTextClass}`}>
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i} scope="col" className={`${cellClass} border-line-s font-extrabold`}>
                    <InlineContent nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} className={`${cellClass} break-words`}>
                      <InlineContent nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((block, i) => <BlockContent key={i} block={block} />)
}
