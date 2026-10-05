// When the server rendered a page, for <LiveTables renderedAt>: a page the client router shows from
// its cache carries an old stamp, so LiveRefresh knows to refresh it in place (#384). A function, so
// a server component reads the clock outside its own render body.
export function renderStamp(): number {
  return Date.now()
}
