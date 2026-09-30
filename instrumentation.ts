import { assertRequiredEnv, warnMissingEnv } from '@/lib/env/required'

export function register() {
  assertRequiredEnv()
  warnMissingEnv()
}
