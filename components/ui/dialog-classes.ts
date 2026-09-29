// The one dialog look and animation, for Base UI's Dialog and AlertDialog alike: the scrim fades
// in, and the panel fades in as it settles from 98%. Each dialog adds its own max-w-*.
export const dialogBackdropClass =
  'fixed inset-0 z-40 bg-scrim transition-opacity duration-(--duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none'

// Centred between the status band and the home indicator in the installed app, and scrolling
// inside itself when it's taller than the screen.
export const dialogPopupClass =
  'fixed top-[calc(50%+(var(--safe-top)-var(--safe-bottom))/2)] left-1/2 z-40 flex max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-6 text-ink shadow-overlay transition-[opacity,scale] duration-(--duration-fast) data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none'
