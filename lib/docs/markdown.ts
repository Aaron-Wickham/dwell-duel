// A small parser for the Markdown our docs actually use: headings, paragraphs, lists, tables,
// bold, italics, code and links. The output is plain data rendered by React, never HTML strings,
// so nothing in a doc can inject markup. Anything fancier renders as its literal text.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }

export type Block =
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] }

export type DocSection = { title: Inline[]; slug: string; blocks: Block[] }
export type Doc = { title: Inline[]; intro: Block[]; sections: DocSection[] }

const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)/

export function parseInline(source: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ type: 'text', text })
    text = ''
  }

  let i = 0
  while (i < source.length) {
    const rest = source.slice(i)
    if (rest.startsWith('**')) {
      const end = source.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        out.push({ type: 'strong', children: parseInline(source.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    } else if (rest[0] === '*' && rest[1] !== ' ') {
      const end = source.indexOf('*', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ type: 'em', children: parseInline(source.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    } else if (rest[0] === '`') {
      const end = source.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ type: 'code', text: source.slice(i + 1, end) })
        i = end + 1
        continue
      }
    } else if (rest[0] === '[') {
      const link = LINK.exec(rest)
      if (link) {
        flush()
        out.push({ type: 'link', href: link[2], children: parseInline(link[1]) })
        i += link[0].length
        continue
      }
    }
    text += source[i]
    i += 1
  }
  flush()
  return out
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  // HTML comments are notes for whoever edits the file, not content.
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)

  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let table: string[][] = []

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) })
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) })
    if (table.length) {
      const [head, ...rows] = table
      blocks.push({ type: 'table', head: head.map(parseInline), rows: rows.map((row) => row.map(parseInline)) })
    }
    paragraph = []
    list = null
    table = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) })
      continue
    }

    if (trimmed.startsWith('|')) {
      if (!table.length) flush()
      // The |---|---| row only separates the header from the body.
      if (!/^\|?[\s:|-]+\|?$/.test(trimmed)) table.push(tableCells(trimmed))
      continue
    }

    const item = /^([-*]|\d+\.)\s+(.*)$/.exec(line)
    if (item) {
      const ordered = /\d/.test(item[1])
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push(item[2])
      continue
    }

    if (list && /^\s/.test(line)) {
      list.items[list.items.length - 1] += ` ${trimmed}`
      continue
    }

    if (list || table.length) flush()
    paragraph.push(trimmed)
  }
  flush()
  return blocks
}

export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : inlineText(n.children))).join('')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// The one h1 titles the page, what comes before the first h2 introduces it, and each h2 opens a
// section of its own.
export function parseDoc(markdown: string): Doc {
  const doc: Doc = { title: [], intro: [], sections: [] }
  for (const block of parseBlocks(markdown)) {
    if (block.type === 'heading' && block.level === 1) {
      doc.title = block.children
    } else if (block.type === 'heading' && block.level === 2) {
      doc.sections.push({ title: block.children, slug: slugify(inlineText(block.children)), blocks: [] })
    } else {
      const current = doc.sections.at(-1)
      if (current) current.blocks.push(block)
      else doc.intro.push(block)
    }
  }
  return doc
}

// A section shown away from its doc (/privacy shows How it works' Your data) keeps its links to the
// doc's other sections by pointing them at the page that has them.
export function rebaseHashLinks(blocks: Block[], prefix: string): Block[] {
  const inline = (nodes: Inline[]): Inline[] =>
    nodes.map((node) => {
      if (node.type === 'link') {
        return { ...node, href: node.href.startsWith('#') ? `${prefix}${node.href.slice(1)}` : node.href, children: inline(node.children) }
      }
      return node.type === 'strong' || node.type === 'em' ? { ...node, children: inline(node.children) } : node
    })
  return blocks.map((block) => {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        return { ...block, children: inline(block.children) }
      case 'list':
        return { ...block, items: block.items.map(inline) }
      case 'table':
        return { ...block, head: block.head.map(inline), rows: block.rows.map((row) => row.map(inline)) }
    }
  })
}
