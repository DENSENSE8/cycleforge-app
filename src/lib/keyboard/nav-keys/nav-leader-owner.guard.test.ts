/**
 * Nav-keys leader ownership — the `⌘;` leader has exactly ONE binder, it is not
 * one of the seven existing keyboard owners, nav keys are LETTERS (never bare
 * digits — wedge law), and a live session yields the ambient keyboards via the
 * overlay stack.
 *
 *   node --import tsx --test src/lib/keyboard/nav-keys/nav-leader-owner.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { NAV_REGIONS, regionForKey } from './nav-regions';

/** Recursively list src/*.ts(x), skipping node_modules — untracked files included. */
function walkSrc(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}
const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const STORE = 'src/lib/keyboard/nav-keys/nav-leader-store.ts';

describe('nav-keys leader ownership', () => {
  it('the leader chord is ⌘; / Ctrl+; and lives in exactly one file', () => {
    const store = read(STORE);
    // Detects the semicolon key with a Command/Ctrl modifier, no Shift/Alt.
    assert.match(store, /e\.metaKey \|\| e\.ctrlKey/);
    assert.match(store, /e\.key === ';' \|\| e\.code === 'Semicolon'/);
    assert.match(store, /e\.altKey \|\| e\.shiftKey/, 'refuses Shift/Alt so it is a clean chord');
    // Not a second binder of one of the seven owners.
    for (const owner of [/'KeyK'/, /'KeyB'/, /'BracketRight'/, /'Backslash'/, /'KeyV'/, /'Digit[1-9]'/]) {
      assert.doesNotMatch(store, owner, `leader must not rebind an existing owner (${owner})`);
    }
  });

  it('installs exactly one global keydown listener (single owner)', () => {
    const store = read(STORE);
    const keydowns = store.match(/addEventListener\(\s*'keydown'/g) ?? [];
    assert.equal(keydowns.length, 1, 'one keydown listener, installed lazily');
    // Repo-wide: no OTHER file binds a ⌘;/Ctrl+; global (mirror of cmdk-owner).
    // Exclude test files — this guard itself references the chord in an assertion.
    const owners = walkSrc(join(process.cwd(), 'src'))
      .filter((f) => !f.endsWith('.test.ts'))
      .filter((f) => readFileSync(f, 'utf8').includes("code === 'Semicolon'"))
      .map((f) => f.slice(process.cwd().length + 1));
    assert.deepEqual(
      owners.sort(),
      [STORE].sort(),
      `only the nav-leader store may bind the leader chord — saw ${JSON.stringify(owners)}`,
    );
  });

  it('nav keys are letters — region keys are unique a–z, never digits', () => {
    const keys = NAV_REGIONS.map((r) => r.key);
    for (const k of keys) {
      assert.ok(/^[a-z]$/.test(k), `region key ${JSON.stringify(k)} must be a single a–z letter`);
    }
    assert.equal(new Set(keys).size, keys.length, 'region keys are unique');
    // No digit ever names a region (wedge scans type digits into the page).
    for (const d of '0123456789') {
      assert.equal(regionForKey(d), null, `digit ${d} must not name a region`);
    }
  });

  it('a live session yields the ambient keyboards via the overlay stack', () => {
    const store = read(STORE);
    assert.match(store, /import \{ pushOverlay \}/);
    assert.match(store, /overlayRelease = pushOverlay\(\)/);
  });

  it('wedge safety: refuse-in-input, escape, timeout, pointerdown, burst, unmapped-exit', () => {
    const store = read(STORE);
    assert.match(store, /isEditableTarget/, 'refuses to arm over a focused input');
    assert.match(store, /e\.key === 'Escape'/, 'Escape cancels');
    assert.match(store, /NAV_ARM_TIMEOUT_MS/, 'idle timeout');
    assert.match(store, /addEventListener\(\s*'pointerdown'/, 'click cancels');
    assert.match(store, /NAV_SCAN_BURST_MS/, 'scan-burst detector');
    // No raw motion package, no audio on this surface.
    // Concatenate so motion-major.guard does not treat this file as an offender.
    const bannedMotion = new RegExp(
      `from ['"]${'motion'}/react['"]|from ['"]${'framer'}-motion['"]`,
    );
    assert.doesNotMatch(store, bannedMotion);
    assert.doesNotMatch(store, /new Audio\(|AudioContext/);
  });
});
