// Standalone iOS draws the time and battery over the page (black-translucent), so this strip
// gives them DwellDuel's teal in both themes. --safe-top is 0px outside standalone, so it
// takes no space in a browser tab or on desktop.
export function StatusBand() {
  return <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-30 h-(--safe-top) bg-status-band" />
}
