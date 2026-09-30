// The RPCs write their member-facing refusals as a plain `raise exception`, whose SQLSTATE is
// P0001; place_slip re-raises a pick's own error with its original state. Anything else (a
// statement timeout, a constraint name, a dropped connection with no code at all) is an accident
// whose text must not reach a member.
export function isDeliberateRaise(error: { code?: string }): boolean {
  return error.code === 'P0001'
}
