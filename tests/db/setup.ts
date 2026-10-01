import { afterEach, beforeAll } from 'vitest'
import { takeLedgerCheckSkip, wipeDatabase } from './helpers'
import { assertLedgerConsistent } from './assertions'

// A file that never seeds (a catalog read, say) would otherwise be checked against whatever the
// previous file left behind, including a test that opted out of the check.
beforeAll(wipeDatabase)

// Runs after every DB test, since each file wipes the database before the next one, so a check
// at the end of a file would only ever see its last test. Files run one at a time (vitest.config.mts),
// so nothing else is writing while this reads.
afterEach(async () => {
  if (!takeLedgerCheckSkip()) await assertLedgerConsistent()
})
