import { D_PATH, LEAF_ANGLES, LEAF_PATH } from '@/components/brand/symbol-paths'
import { INTRO_SYMBOL_ID } from './intro-clock'
import { IntroDirector } from './intro-director'
import { INTRO_CSS_DELAYS } from './intro-timeline'

const SET_DELAYS = Object.entries(INTRO_CSS_DELAYS)
  .map(([name, ms]) => `r.style.setProperty('${name}','${ms}ms')`)
  .join(';')

// Runs while the HTML is still parsing, before the first paint, so the page opens on the intro's
// first frame or on its last, never one and then the other. Once a session, like the launch screen.
export const PLAY_ONCE_PER_SESSION = `try{var r=document.documentElement;if(!sessionStorage.getItem('dd-sign-in-intro')&&r.dataset.motion!=='reduce'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){sessionStorage.setItem('dd-sign-in-intro','1');${SET_DELAYS};r.dataset.signInIntro=''}}catch(e){}`

// The launch screen's frames on the page's own background: the D centred, its leaves growing in
// one after another, then (IntroDirector) the symbol flying into the wordmark. In the installed
// app the launch screen plays over this and fades just as the symbol starts to move.
export function SignInIntro() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PLAY_ONCE_PER_SESSION }} />
      <div aria-hidden="true" className="sign-in-intro">
        <div className="sign-in-intro-backdrop absolute inset-0 bg-bg" />
        <svg id={INTRO_SYMBOL_ID} viewBox="0 0 100 100" className="sign-in-intro-symbol relative size-[32vmin]">
          <g transform="translate(50 50) translate(-55.5 -41.5)">
            {LEAF_ANGLES.map((angle, i) => (
              <g key={angle} transform={`rotate(${angle} 50 50)`}>
                <path d={LEAF_PATH} className="launch-leaf fill-lime" style={{ animationDelay: `${150 + i * 120}ms` }} />
              </g>
            ))}
            <path d={D_PATH} fillRule="evenodd" className="fill-sym-d" />
          </g>
        </svg>
      </div>
      <IntroDirector />
    </>
  )
}
