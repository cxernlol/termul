/**
 * Worktree-local vitest config — TEMPORARY, not committed. CI uses the real
 * vitest.config.ts (node_modules inside repo root). Local slice worktrees
 * symlink node_modules at /root/termul; vite denies ids whose realpath is
 * outside fs.allow, so extend allow with the shared node_modules realpath.
 */
import base from './vitest.config'
import { defineConfig } from 'vitest/config'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

const sharedNodeModules = realpathSync(join(__dirname, 'node_modules'))

export default defineConfig({
  ...base,
  server: { fs: { allow: [__dirname, sharedNodeModules] } }
})
