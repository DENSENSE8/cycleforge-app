/**
 * ⌘. / Ctrl+. — arm next carton scan — has exactly ONE owner: scan-hotkey/store.
 *
 *   node --import tsx --test src/lib/scan-hotkey/next-scan-chord.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { isNextScanChord } from './store';

const SRC = join(process.cwd(), 'src');
const OWNER = 'lib/scan-hotkey/store.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** A ⌘. / Ctrl+. binder — meta/ctrl + Period (or key === '.'). */
function bindsCmdPeriod(code: string): boolean {
  const wantsModifier = /metaKey|ctrlKey/.test(code);
  if (!wantsModifier) return false;
  return (
    /key\s*===\s*['"]\.['"]/.test(code) ||
    /code\s*===\s*['"]Period['"]/.test(code)
  );
}

describe('⌘. next-scan chord owner', () => {
  it('isNextScanChord matches Meta/Ctrl+. only', () => {
    const base = {
      altKey: false,
      shiftKey: false,
      key: '.',
      code: 'Period',
    } as KeyboardEvent;
    assert.equal(isNextScanChord({ ...base, metaKey: true, ctrlKey: false } as KeyboardEvent), true);
    assert.equal(isNextScanChord({ ...base, metaKey: false, ctrlKey: true } as KeyboardEvent), true);
    assert.equal(isNextScanChord({ ...base, metaKey: false, ctrlKey: false } as KeyboardEvent), false);
    assert.equal(
      isNextScanChord({ ...base, metaKey: true, ctrlKey: false, shiftKey: true } as KeyboardEvent),
      false,
    );
    assert.equal(
      isNextScanChord({
        ...base,
        key: 'q',
        code: 'KeyQ',
        metaKey: true,
        ctrlKey: false,
      } as KeyboardEvent),
      false,
    );
  });

  it('exactly one file binds ⌘. / Ctrl+. to act on it', () => {
    const files = walk(SRC).filter((f) => !f.endsWith('next-scan-chord.guard.test.ts'));
    const binders = files
      .filter((f) => bindsCmdPeriod(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1).split('\\').join('/'));

    assert.deepEqual(
      binders,
      [OWNER],
      `⌘. must have exactly one owner (${OWNER}). Found: ${binders.join(', ') || 'none'}`,
    );
  });

  it('store documents armNext + capture-phase listener', () => {
    const src = readFileSync(join(SRC, OWNER), 'utf8');
    assert.match(src, /armNext/);
    assert.match(src, /capture:\s*true/);
    assert.match(src, /SCAN_NEXT_REQUESTED_EVENT/);
    assert.match(src, /Period/);
    assert.match(src, /NEXT_SCAN_CHORD_LABEL/);
  });

  it('ScanHotkeyControl leads with NEXT_SCAN_CHORD_LABEL (not Insert as primary)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/scan/ScanHotkeyControl.tsx'),
      'utf8',
    );
    assert.match(src, /NEXT_SCAN_CHORD_LABEL/);
    assert.match(src, /Next scan/);
    // Primary chip must render the next-scan label — reclaim stays secondary.
    assert.match(src, /\{NEXT_SCAN_CHORD_LABEL\}/);
  });
});
