import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Two projects: unit and component tests run in parallel; DB tests share one local Supabase and
// wipe it between files (seedMembers), so they run one file at a time, with room for the slow ones.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], exclude: ['tests/db/**'] },
      },
      {
        extends: true,
        test: { name: 'db', include: ['tests/db/**/*.test.ts'], fileParallelism: false, testTimeout: 15_000 },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      // Next resolves `server-only` to an empty module on the server; tests run server code too.
      'server-only': path.resolve(import.meta.dirname, 'node_modules/next/dist/compiled/server-only/empty.js'),
    },
  },
})
