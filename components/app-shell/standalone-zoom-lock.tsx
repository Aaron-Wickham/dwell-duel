// Runs while the HTML is still parsing: only the installed app locks zoom (D6, #402), because a
// pinch-zoomed standalone page leaves the fixed top and tab bars displaced from the screen edges,
// with no browser chrome to get back. A browser tab keeps pinch-zoom for anyone who needs it.
export const STANDALONE_ZOOM_LOCK = `try{if(matchMedia('(display-mode: standalone)').matches){var m=document.querySelector('meta[name="viewport"]');if(m&&m.content.indexOf('user-scalable')<0)m.content+=', maximum-scale=1, user-scalable=no'}}catch(e){}`

export function StandaloneZoomLock() {
  return <script dangerouslySetInnerHTML={{ __html: STANDALONE_ZOOM_LOCK }} />
}
