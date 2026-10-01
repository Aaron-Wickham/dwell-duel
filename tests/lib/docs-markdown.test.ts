import { describe, it, expect } from 'vitest'
import { parseBlocks, parseDoc, parseInline, rebaseHashLinks } from '@/lib/docs/markdown'

describe('parseInline', () => {
  it('reads bold, italics, code and links, nesting inside them', () => {
    expect(parseInline('a **b *c* d** `e` [f **g**](/h)')).toEqual([
      { type: 'text', text: 'a ' },
      {
        type: 'strong',
        children: [{ type: 'text', text: 'b ' }, { type: 'em', children: [{ type: 'text', text: 'c' }] }, { type: 'text', text: ' d' }],
      },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'e' },
      { type: 'text', text: ' ' },
      { type: 'link', href: '/h', children: [{ type: 'text', text: 'f ' }, { type: 'strong', children: [{ type: 'text', text: 'g' }] }] },
    ])
  })

  it('leaves a lone asterisk or an unclosed bracket as text', () => {
    expect(parseInline('2 * 3 [not a link')).toEqual([{ type: 'text', text: '2 * 3 [not a link' }])
  })
})

describe('parseBlocks', () => {
  it('joins wrapped paragraph and list lines, and skips comments and table separators', () => {
    const blocks = parseBlocks(
      ['<!-- a note -->', 'one', 'two', '', '- a', '  more', '- b', '1. first', '', '| H1 | H2 |', '|---|---|', '| x | y |'].join('\n'),
    )
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'one two' }] },
      { type: 'list', ordered: false, items: [[{ type: 'text', text: 'a more' }], [{ type: 'text', text: 'b' }]] },
      { type: 'list', ordered: true, items: [[{ type: 'text', text: 'first' }]] },
      {
        type: 'table',
        head: [[{ type: 'text', text: 'H1' }], [{ type: 'text', text: 'H2' }]],
        rows: [[[{ type: 'text', text: 'x' }], [{ type: 'text', text: 'y' }]]],
      },
    ])
  })
})

describe('parseDoc', () => {
  it('splits the doc into its title, an intro and one section per h2', () => {
    const doc = parseDoc('# Title\n\nIntro.\n\n## First part\n\nBody.\n\n### Detail\n\n## Second\n')
    expect(doc.title).toEqual([{ type: 'text', text: 'Title' }])
    expect(doc.intro).toHaveLength(1)
    expect(doc.sections.map((s) => [s.slug, s.blocks.length])).toEqual([
      ['first-part', 2],
      ['second', 0],
    ])
  })
})

describe('rebaseHashLinks', () => {
  it('points the doc’s own anchors at another page, everywhere a link can sit, and leaves other links alone', () => {
    const blocks = parseBlocks(
      ['See [Roles](#roles) and **[Tasks](#tasks)**.', '', '- [web](https://example.com)', '', '| a |', '|---|', '| [Limits](#limits) |'].join('\n'),
    )
    const hrefs = JSON.stringify(rebaseHashLinks(blocks, '/how-it-works#how-')).match(/"href":"[^"]+"/g)
    expect(hrefs).toEqual([
      '"href":"/how-it-works#how-roles"',
      '"href":"/how-it-works#how-tasks"',
      '"href":"https://example.com"',
      '"href":"/how-it-works#how-limits"',
    ])
  })
})
