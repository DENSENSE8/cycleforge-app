#!/usr/bin/env node
/**
 * Gate preamble (Fact-Forcing):
 * Importers/callers: scripts/verify-profile.mjs Typecheck gate → verify:fast /
 * cursor-eval stamp. Affected API: none (CLI wrapper). Data schemas: none.
 * User (verbatim): "Machine eval failed. Stamp .cursor/eval-session.json…
 * Make that contract green." Failure was corrupt .next/dev/types/routes.d.ts.
 *
 * Typecheck gate — `next typegen` then local `tsc -p tsconfig.verify.json`.
 *
 * Turbopack rewrites `.next/dev/types/routes.d.ts` while a concurrent
 * `next dev` is running. Mid-write that file is truncated (unterminated
 * JSDoc fences → TS1005 / TS1160) and machine-eval / verify:fast goes red
 * even when src/ is clean. `next typegen` also re-adds `.next/dev/types` to
 * tsconfig.json — verify uses tsconfig.verify.json which never includes
 * `/dev/types`, so concurrent Next patches cannot poison the gate.
 *
 * Incremental `tsconfig.verify.tsbuildinfo` is also a poison path: a half
 * updated program reports phantom TS2304 (e.g. UnshippedTable calling a hook
 * whose import the cache still thought was absent). The verify tsconfig
 * sets incremental: false so this gate never reads that file.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const bin = (name) =>
  path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.CMD` : name);

const shell = process.platform === 'win32';
const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=6144' };

const typegen = spawnSync(bin('next'), ['typegen'], {
  stdio: 'inherit',
  env,
  shell,
});
if (typegen.status !== 0) process.exit(typegen.status ?? 1);

const tsc = spawnSync(bin('tsc'), ['--noEmit', '-p', 'tsconfig.verify.json'], {
  stdio: 'inherit',
  env,
  shell,
});
process.exit(tsc.status ?? 1);
