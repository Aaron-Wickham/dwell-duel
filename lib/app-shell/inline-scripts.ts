import { INTRO_CSS_DELAYS } from '@/components/sign-in/intro-timeline'

// The app's own inline scripts, each run while the HTML is still parsing. They live here, apart
// from the components that render them, because the CSP allows exactly these texts by their hash
// (lib/security/script-hashes.ts, in the proxy): a change to one is a new hash, made at build.

// Only an installed app's cold start (a new session) shows the launch screen's overlay, so a
// browser tab and every later navigation never do.
export const SHOW_ON_COLD_START = `try{if(matchMedia('(display-mode: standalone)').matches&&!sessionStorage.getItem('dd-launched')){sessionStorage.setItem('dd-launched','1');document.documentElement.dataset.launch=''}}catch(e){}`

// Only the installed app locks zoom (D6, #402), because a pinch-zoomed standalone page leaves the
// fixed top and tab bars displaced from the screen edges, with no browser chrome to get back. A
// browser tab keeps pinch-zoom for anyone who needs it.
export const STANDALONE_ZOOM_LOCK = `try{if(matchMedia('(display-mode: standalone)').matches){var m=document.querySelector('meta[name="viewport"]');if(m&&m.content.indexOf('user-scalable')<0)m.content+=', maximum-scale=1, user-scalable=no'}}catch(e){}`

const SET_DELAYS = Object.entries(INTRO_CSS_DELAYS)
  .map(([name, ms]) => `r.style.setProperty('${name}','${ms}ms')`)
  .join(';')

// Before the first paint, so the sign-in page opens on the intro's first frame or on its last,
// never one and then the other. Once a session, like the launch screen.
export const PLAY_ONCE_PER_SESSION = `try{var r=document.documentElement;if(!sessionStorage.getItem('dd-sign-in-intro')&&r.dataset.motion!=='reduce'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){sessionStorage.setItem('dd-sign-in-intro','1');${SET_DELAYS};r.dataset.signInIntro=''}}catch(e){}`

export const INLINE_SCRIPTS = [SHOW_ON_COLD_START, STANDALONE_ZOOM_LOCK, PLAY_ONCE_PER_SESSION] as const
