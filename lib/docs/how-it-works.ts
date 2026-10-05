import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseDoc } from './markdown'

// Read once, when the server first loads this module. next.config.ts's outputFileTracingIncludes
// ships the file alongside /how-it-works/rules and /privacy, since a deployed function only has the files it traces.
export const howItWorks = parseDoc(readFileSync(path.join(process.cwd(), 'docs/HOW-IT-WORKS.md'), 'utf8'))
