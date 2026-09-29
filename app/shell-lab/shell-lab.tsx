'use client'

import { useEffect, useRef, useState } from 'react'

type Reading = Record<string, string>

const HEIGHTS = ['100%', '100dvh', '100lvh', '100svh', 'screen'] as const
type Height = (typeof HEIGHTS)[number]

function px(n: number): string {
  return `${Math.round(n * 10) / 10}`
}

export function ShellLab() {
  const [reading, setReading] = useState<Reading>({})
  const [height, setHeight] = useState<Height | 'none'>('none')
  const [tall, setTall] = useState(false)
  const probe = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function read() {
      const p = probe.current
      if (!p) return
      const box = p.getBoundingClientRect()
      const cs = getComputedStyle(p)
      const vv = window.visualViewport
      setReading({
        standalone: String(window.matchMedia('(display-mode: standalone)').matches),
        'navigator.standalone': String((navigator as unknown as { standalone?: boolean }).standalone),
        'innerHeight': px(window.innerHeight),
        'visualViewport.height': px(vv?.height ?? -1),
        'visualViewport.offsetTop': px(vv?.offsetTop ?? -1),
        'visualViewport.scale': px(vv?.scale ?? -1),
        'documentElement.clientHeight': px(document.documentElement.clientHeight),
        'body.scrollHeight': px(document.body.scrollHeight),
        'screen.height': px(window.screen.height),
        'screen.availHeight': px(window.screen.availHeight),
        'safe top': cs.paddingTop,
        'safe bottom': cs.paddingBottom,
        'probe 100dvh': px(box.height),
        scrollY: px(window.scrollY),
      })
    }
    read()
    const timer = setInterval(read, 700)
    window.addEventListener('resize', read)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', read)
    }
  }, [height, tall])

  const frameHeight = height === 'screen' ? `${window.screen.height}px` : height

  return (
    <div style={{ minHeight: '100%', background: '#021B1F', color: '#EAF4EE', font: '14px/1.4 system-ui' }}>
      {/* Paints well past every edge, so the page's own background can't pass for a gap. */}
      <div aria-hidden="true" style={{ position: 'fixed', top: -300, bottom: -300, left: 0, right: 0, background: '#021B1F', zIndex: 0 }} />
      {/* Measures the safe-area insets, and 100dvh as a real box. */}
      <div
        ref={probe}
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          width: 1,
          height: '100dvh',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      />
      <div style={{ padding: '70px 14px 20px', position: 'relative', zIndex: 10 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Shell lab</h1>
        <p style={{ margin: '0 0 10px' }}>
          Open this in the installed app. A red frame is one candidate for the screen’s height; its green bar sits at the
          frame’s bottom. The right height puts the green bar at the very bottom of the screen.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {(['none', ...HEIGHTS] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHeight(h)}
              style={{
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 10,
                border: '2px solid #72DB2B',
                background: h === height ? '#72DB2B' : 'transparent',
                color: h === height ? '#03272D' : '#EAF4EE',
                font: 'inherit',
              }}
            >
              {h === 'none' ? 'plain fixed bottom:0' : `frame ${h}`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTall((t) => !t)}
            style={{ minHeight: 44, padding: '0 12px', borderRadius: 10, border: '2px solid #F0C15A', background: tall ? '#F0C15A' : 'transparent', color: tall ? '#03272D' : '#EAF4EE', font: 'inherit' }}
          >
            {tall ? 'page is tall' : 'page is short'} (tap to toggle)
          </button>
        </div>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {Object.entries(reading).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '1px 10px 1px 0', opacity: 0.75 }}>{k}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tall && <div style={{ height: 1800 }} />}
      </div>

      {height === 'none' ? (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 60, background: '#72DB2B', color: '#03272D', textAlign: 'center', font: '700 16px/60px system-ui', zIndex: 5 }}>
          fixed bottom:0
        </div>
      ) : (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: frameHeight, border: '3px solid #FF5A4A', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 5 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, background: '#72DB2B', color: '#03272D', textAlign: 'center', font: '700 16px/60px system-ui' }}>
            frame {height} bottom
          </div>
        </div>
      )}
    </div>
  )
}
