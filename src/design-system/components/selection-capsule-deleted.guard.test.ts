/**
 * Ratchet: the bottom glass selection capsule is gone.
 *
 * Multi-select on workbench tables opens the push right rail
 * (`RailSelectionBand` / `RailActionRegion` via `*RailSelection` hooks).
 * Remounting `ContextualSelectionBar` / `MobileSelectionBar` is a regression.
 *
 * SoT: Unbox History rail plane; plan hoard History rail SoT Wave 4.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd(), 'src');

const BANNED = [
  /<\s*ContextualSelectionBar\b/,
  /<\s*MobileSelectionBar\b/,
  /from\s+['"]@\/design-system\/components\/ContextualSelectionBar['"]/,
  /from\s+['"]@\/design-system\/components\/MobileSelectionBar['"]/,
  /from\s+['"]\.\/ContextualSelectionBar['"]/,
  /from\s+['"]\.\/MobileSelectionBar['"]/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.guard.test.ts')) out.push(full);
  }
  return out;
}

/** Strip block comments so doc prose cannot trip the ban. */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('selection capsule deleted — right rail is the multi-select plane', () => {
  it('no JSX mount or import of ContextualSelectionBar / MobileSelectionBar under src/', () => {
    const hits: string[] = [];
    for (const file of walk(ROOT)) {
      const src = stripBlockComments(readFileSync(file, 'utf8'));
      for (const re of BANNED) {
        if (re.test(src)) {
          hits.push(`${relative(process.cwd(), file)} (~${re})`);
          break;
        }
      }
    }
    assert.deepEqual(
      hits,
      [],
      `Bottom selection capsule must stay deleted:\n${hits.join('\n')}`,
    );
  });

  it('capsule component files do not exist', () => {
    for (const rel of [
      'src/design-system/components/ContextualSelectionBar.tsx',
      'src/design-system/components/MobileSelectionBar.tsx',
      'src/design-system/components/selection-bar-geometry.ts',
    ]) {
      try {
        statSync(join(process.cwd(), rel));
        assert.fail(`${rel} must stay deleted`);
      } catch (err) {
        assert.equal((err as NodeJS.ErrnoException).code, 'ENOENT');
      }
    }
  });
});
