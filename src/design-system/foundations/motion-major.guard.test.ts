import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Phase 5 motion consolidation ratchet:
 * 1) Exactly one framer-motion major in the install tree (no 11+12 context split).
 * 2) App code does not import `motion/react` — SoT is `framer-motion`; Motion+
 *    only via `@/design-system/motion`.
 */

const SRC_ROOT = join(process.cwd(), 'src');
const MOTION_REACT_RE = /from\s+['"]motion\/react['"]/;
const ALLOW_MOTION_REACT = new Set([
  // none today — motion-plus re-exports live under design-system/motion
]);

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

test('app code does not import motion/react (use framer-motion / design-system/motion)', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC_ROOT)) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (ALLOW_MOTION_REACT.has(rel)) continue;
    const text = readFileSync(file, 'utf8');
    if (MOTION_REACT_RE.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `import motion/react from:\n${offenders.join('\n')}`);
});
