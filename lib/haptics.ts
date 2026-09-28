// Android only in practice: iOS Safari has no Vibration API, even for a home-screen app.
function vibrate(pattern: number | number[]) {
  if (typeof document !== 'undefined' && document.documentElement.dataset.haptics === 'off') return
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
}

export const haptics = {
  tap: () => vibrate(10),
  success: () => vibrate([15, 60, 15]),
  error: () => vibrate([40, 60, 40]),
}
