/**
 * Quiet CopyChip faces — no solid/dashed bottom rule on filled identity chips.
 *
 * Plan: docs/todo/copy-cell-plain-and-chip-underline-PLAN.md (Phase 1).
 * Tone is icon + mono + click-to-copy; underlines were retired as copy affordance.
 *
 * Run: `npx tsx --test src/components/ui/copy-chip-quiet-face.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHIP_SRC = readFileSync(resolve(import.meta.dirname, 'CopyChip.tsx'), 'utf8');

test('CHIP_TONES has no underline keys', () => {
  assert.doesNotMatch(
    CHIP_SRC,
    /export const CHIP_TONES = \{[\s\S]*?underline:/,
    'CHIP_TONES must not declare underline — tone is iconClass + dot only',
  );
});

test('CopyChipProps has no underlineClass', () => {
  assert.doesNotMatch(
    CHIP_SRC,
    /underlineClass\?:/,
    'CopyChip / PlatformChip / AddValueChipFace must not expose underlineClass',
  );
});

test('filled chip mono faces do not paint border-b-2', () => {
  // Allow comments that mention border-b historically; ban live class strings.
  const live = CHIP_SRC.split('\n').filter(
    (line) => line.includes('border-b-2') && !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'),
  );
  assert.equal(
    live.length,
    0,
    `quiet chips must not apply border-b-2; found:\n${live.map((l) => `  ${l.trim()}`).join('\n')}`,
  );
});

test('CopyableCellValue uses useCopyChip', () => {
  assert.match(CHIP_SRC, /export function CopyableCellValue/);
  const idx = CHIP_SRC.indexOf('export function CopyableCellValue');
  const body = CHIP_SRC.slice(idx, idx + 800);
  assert.match(body, /useCopyChip\(/, 'plain cell copy must share useCopyChip, not a twin clipboard path');
});
