// The email a not-invited sign-in used, for /not-invited to show (#263). A cookie, never the URL,
// so the address isn't left in history or logs. httpOnly, scoped to that page and short-lived,
// and the page clears it once shown.
export const NOT_INVITED_EMAIL_COOKIE = 'not-invited-email'
export const NOT_INVITED_EMAIL_MAX_AGE = 60 * 5
export const NOT_INVITED_PATH = '/not-invited'
