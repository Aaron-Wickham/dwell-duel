import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.resolve(import.meta.dirname, '../../../app/globals.css'), 'utf8')

// The installed iPhone app sizes its viewport to the page, up to the screen, so a page shorter
// than the screen gets a short viewport and the tab bar and launch overlay float above the bottom
// (#127, #128). Only a body at least 100lvh tall fixes it, and in a browser tab that would make
// every page scroll a little, so it must stay inside the standalone media query. jsdom can't run
// the viewport itself, so this guards the rule.
describe('standalone page height', () => {
  const block = /@media \(display-mode: standalone\)\s*\{\s*body\s*\{([^}]*)\}\s*\}/.exec(css)

  it('makes body at least the large viewport tall in the installed app', () => {
    expect(block).not.toBeNull()
    expect(block![1]).toMatch(/min-height:\s*100lvh/)
  })

  it('does not apply it outside standalone', () => {
    const outside = css.replace(/@media \(display-mode: standalone\)[\s\S]*?\n\}\n/g, '')
    expect(outside).not.toMatch(/100lvh/)
  })

  // The overlay is painted in the first frames of a cold start, while the viewport can still be
  // short. inset: 0 would centre its D in that short area, so it flashed doubled against the
  // system splash's D and jumped when iOS corrected the viewport. 100lvh is the screen's height
  // from the first frame.
  it('sizes the launch overlay to the large viewport, not to inset: 0', () => {
    const rule = /:root\[data-launch\] \.launch-screen\s*\{([^}]*)\}/.exec(css)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/height:\s*100lvh/)
    expect(rule![1]).not.toMatch(/inset:\s*0/)
  })
})
