import { STANDALONE_ZOOM_LOCK } from '@/lib/app-shell/inline-scripts'

export function StandaloneZoomLock() {
  return <script dangerouslySetInnerHTML={{ __html: STANDALONE_ZOOM_LOCK }} />
}
