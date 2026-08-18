/**
 * A chip face inside a LedgerGrid cell is FLUSH — the cell owns the inset.
 *
 * The defect this pins (bench, 2026-08-02): `CopyChip`'s wrapper carries
 * `px-1.5`, and inside a grid cell that stacks on the cell's own `px-2`
 * (`ORDERS_QUEUE_CELL_INSET`). Every chip value therefore sat 6px inside its
 * column's content edge, so no chip lined up with the plain-text cells above or
 * below it — visible on `order` (chip) against `title` (plain) in the same grid.
 *
 * The fix is a property of the CONTAINER, not of each call site: one unlayered
 * rule, `[data-cf-grid] [data-chip-face] { padding-inline: 0 }`, in
 * styles/globals.css`. That reaches all LedgerGrid families (every one composes
 * `ledgerGridCell` from `@/design-system/components/grid`) and the next one for
 * free, where `outerPad="flush"` would have been a prop ~12 chip call sites each
 * had to remember — the shape that drifts (`pattern-evolution.md`).
 *
 * Two halves, and BOTH are needed for the rule to do anything:
 *   1. every chip-face wrapper that owns the outer padding carries the marker, and
 *   2. the stylesheet still carries the rule that reads it.
 *
 * Run: `npx tsx --test src/components/ui/copy-chip-grid-flush.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHIP_SRC = readFileSync(resolve(import.meta.dirname, 'CopyChip.tsx'), 'utf8');
const CSS = readFileSync(
  resolve(import.meta.dirname, '../../styles/globals.css'),
  'utf8',
);

/**
 * The outer chip-face padding, as written in `CopyChip.tsx`. Every element that
 * applies it is a face wrapper and must be markable.
 */
const OUTER_PAD = 'px-1.5';

test('every chip-face wrapper carries the data-chip-face marker', () => {
  const lines = CHIP_SRC.split('\n');
  // Wrappers apply the pad either as a literal class or via the `outerPx`
  // binding (`CopyChip` itself). Both are face wrappers.
  const padLines = lines
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(
      ({ line }) =>
        (line.includes(OUTER_PAD) || line.includes('${outerPx}')) &&
        (line.includes('className') || line.includes('class=')) &&
        !line.trimStart().startsWith('*'),
    );

  assert.ok(
    padLines.length >= 4,
    `expected the known chip faces to still apply ${OUTER_PAD}; found ${padLines.length}`,
  );

  for (const { line, n } of padLines) {
    // The marker is spread onto the same element — search the element's opening
    // tag, which starts at the nearest `<` above and ends at this line.
    const start = CHIP_SRC.split('\n').slice(0, n).join('\n').lastIndexOf('<');
    const openingTag = CHIP_SRC.slice(start, CHIP_SRC.indexOf('>', start) + 1);
    assert.ok(
      openingTag.includes('CHIP_FACE_ATTR') || openingTag.includes('data-chip-face'),
      `CopyChip.tsx:${n} applies the outer chip pad but the element does not spread CHIP_FACE_ATTR — ` +
        `it will keep its 6px inset inside a grid cell and stop lining up with plain-text values.\n` +
        `  ${line.trim()}`,
    );
  }
});

test('the marker is defined once, module-private, as a spreadable object', () => {
  assert.match(
    CHIP_SRC,
    /^const CHIP_FACE_ATTR = \{ 'data-chip-face': '' \} as const;$/m,
    'CHIP_FACE_ATTR must stay a single module-private spreadable declaration — a hand-typed ' +
      'data-chip-face per face is the duplication this replaces, and exporting it invites a ' +
      'surface to stamp the marker on something that is not a chip face',
  );
});

test('globals.css still zeroes chip-face padding inside a grid', () => {
  // Whitespace-tolerant: the rule may be reformatted, but the selector and the
  // declaration have to survive together.
  const rule = /\[data-cf-grid\]\s+\[data-chip-face\]\s*\{[^}]*padding-inline:\s*0/;
  assert.match(
    CSS,
    rule,
    'the `[data-cf-grid] [data-chip-face]` flush rule is gone from styles/globals.css — ' +
      'every chip in every LedgerGrid is back to sitting 6px inside its column edge',
  );
});

test('the sheet stays unlayered so the rule beats the Tailwind utility', () => {
  // Tailwind v4 emits utilities into `@layer utilities`; an UNLAYERED rule wins
  // over a layered one regardless of specificity or source order — which is the
  // only reason a plain `padding-inline: 0` can override `px-1.5` from a file
  // that is imported BEFORE Tailwind. `styles/globals.css` has no `@layer` at
  // all today; introducing one around this block would silently hand the
  // cascade back to the chip.
  assert.ok(
    !/@layer/.test(CSS),
    'styles/globals.css grew an @layer — the chip-face flush rule (and every other override in this file) loses to Tailwind utilities once layered',
  );
});
