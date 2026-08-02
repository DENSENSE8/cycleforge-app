import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Motion boundary ratchet.
 *
 *   1) Exactly one motion major in the install tree (no 11+12 context split).
 *   2) NO file outside `src/design-system/motion/**` names a motion package.
 *
 * Rule (2) INVERTED on 2026-08-01. It used to read "app code does not import
 * `motion/react` — SoT is `framer-motion`", which is the opposite of today's
 * law: the engine is `motion/react`, it is named in exactly one file
 * (`src/design-system/motion/framer.ts`), and everything else imports
 * `@/design-system/motion`. `framer-motion` is the legacy alias for the same
 * v12 engine, not a second library — so both specifiers are now banned outside
 * the boundary, and which one sits behind it is a dependency decision rather
 * than a 220-file migration.
 *
 * Law: `.claude/rules/display/motion-crossfade.md` → The import boundary.
 */

const SRC_ROOT = join(process.cwd(), 'src');

/** Any module-specifier position: `from 'x'`, `import 'x'`, `import('x')`, `require('x')`. */
const MOTION_PKG_RE = /(?:from|import|require)\s*\(?\s*['"](?:framer-motion|motion\/react)['"]/;

/** The one directory allowed to name the engine. */
const BOUNDARY_PREFIX = 'design-system/motion/';

/**
 * This file quotes both package names in `MOTION_PKG_RE` above, so it matches
 * its own rule. Every other exemption is a bug — add a barrel export instead.
 */
const SELF = 'design-system/foundations/motion-major.guard.test.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

test('lockfile has a single framer-motion version', () => {
  const out = execFileSync('pnpm', ['why', 'framer-motion'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(out, /Found 1 version of framer-motion/, out);
});

test('no file outside src/design-system/motion/** names a motion package', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC_ROOT)) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (rel === SELF || rel.startsWith(BOUNDARY_PREFIX)) continue;
    if (MOTION_PKG_RE.test(readFileSync(file, 'utf8'))) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `Import from '@/design-system/motion' instead — these name a motion package directly:\n${offenders.join('\n')}`,
  );
});

test('the boundary is exactly one file deep', () => {
  const namers: string[] = [];
  for (const file of walk(join(SRC_ROOT, 'design-system', 'motion'))) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (MOTION_PKG_RE.test(readFileSync(file, 'utf8'))) namers.push(rel);
  }
  // `plus.ts` names `motion-plus/react` — a different package, off this barrel
  // on purpose (bundle altitude), and not matched by MOTION_PKG_RE.
  assert.deepEqual(
    namers,
    ['design-system/motion/framer.ts'],
    'The engine must be named in framer.ts and nowhere else — that single point is what makes the package swappable.',
  );
});
