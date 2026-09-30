import { afterEach } from 'vitest'
import { assertLedgerConsistent, takeLedgerCheckSkip } from './helpers'

// Runs after every DB test, since each file wipes the database before the next one, so a check
// at the end of a file would only ever see its last test. Files run one at a time (vitest.config.ts),
// so nothing else is writing while this reads.
afterEach(async () => {
  if (!takeLedgerCheckSkip()) await assertLedgerConsistent()
})
