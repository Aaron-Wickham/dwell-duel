import { DURATION } from '@/lib/ui/motion'
import { LEAF_ANGLES, LEAF_PATH, D_PATH } from './symbol-paths'

// Runs while the HTML is still parsing, before the first paint: only an installed app's cold start
// (a new session) shows the overlay, so a browser tab and every later navigation never do.
const SHOW_ON_COLD_START = `try{if(matchMedia('(display-mode: standalone)').matches&&!sessionStorage.getItem('dd-launched')){sessionStorage.setItem('dd-launched','1');document.documentElement.dataset.launch=''}}catch(e){}`

// The static iOS splash (scripts/generate-splash.mjs) is the white D alone on teal, 32vmin wide and
// centred. This overlay's first frame is that exact picture; the leaves then grow in one after
// another and the overlay fades to the app. It's all CSS (globals.css, "Launch screen").
export function LaunchScreen() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SHOW_ON_COLD_START }} />
      <div aria-hidden="true" className="launch-screen">
        <svg viewBox="0 0 100 100" className="size-[32vmin]">
          <g transform="translate(50 50) translate(-55.5 -41.5)">
            {LEAF_ANGLES.map((angle, i) => (
              <g key={angle} transform={`rotate(${angle} 50 50)`}>
                <path d={LEAF_PATH} className="launch-leaf fill-lime" style={{ animationDelay: `${DURATION.fast + i * DURATION.press}ms` }} />
              </g>
            ))}
            <path d={D_PATH} fillRule="evenodd" className="fill-on-splash" />
          </g>
        </svg>
      </div>
    </>
  )
}
