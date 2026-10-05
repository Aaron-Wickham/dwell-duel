// The signed-in page behind every sheet. The slip makes it inert while open, so focus that slips
// past the sheet's own guards (key repeat, or Tab before the sheet takes focus) has nowhere to land
// but the sheet (#392).
export const APP_SHELL_ID = 'app-shell'
