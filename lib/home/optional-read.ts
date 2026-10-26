// A Home block that can be left out (HOME-1): if its read fails, the failure is logged and the page
// renders without the block, rather than one flaky read blanking the balance and bets with it.
export async function optionalRead<T>(what: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch (error: unknown) {
    console.error(`Reading ${what} failed`, error)
    return fallback
  }
}
