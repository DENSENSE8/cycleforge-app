#!/usr/bin/env node
/**
 * Runs release-notes generation locally only.
 * Skipped on Vercel and CI — src/data/release-notes.json is committed and
 * deploy pipelines refresh it explicitly when app code changes.
 */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

if (process.env.VERCEL === '1' || process.env.CI === 'true') {
  console.log('[prebuild] skipping release-notes on Vercel/CI (using committed src/data/release-notes.json)');
  process.exit(0);
}

execSync('node scripts/generate-release-notes.mjs', { cwd: repoRoot, stdio: 'inherit' });
