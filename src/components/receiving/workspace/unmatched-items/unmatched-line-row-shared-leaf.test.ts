import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Phase 1 guard (receiving-condition-serial-unification-plan.md): an unfound
 * per-line row must render its condition + serial editor through the SAME
 * `ActiveLineConditionSerial` leaf a matched PO line uses — never a forked bare
 * `SerialCard` body. This keeps multi-qty / single-qty parity by construction
 * and is the seam Phase 2 routes through the accordion.
 *
 * Source-text guard (mirrors po-lines-accordion-meta-order.test.ts) — it reads
 * the component file rather than rendering, so it needs no DOM/react runtime.
 */
const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'UnmatchedLineRow.tsx'),
  'utf8',
);

test('UnmatchedLineRow composes ActiveLineConditionSerial', () => {
  assert.ok(
    /import\s*\{\s*ActiveLineConditionSerial\s*\}/.test(SRC),
    'UnmatchedLineRow must import ActiveLineConditionSerial',
  );
  assert.ok(
    /<ActiveLineConditionSerial\b/.test(SRC),
    'UnmatchedLineRow must render <ActiveLineConditionSerial /> as its default editor',
  );
});

test('UnmatchedLineRow does not fork a bare SerialCard editor body', () => {
  // The saved-serial chip menu re-uses SerialChipWithMenu, but the editor leaf
  // must be ActiveLineConditionSerial — a raw <SerialCard> render site would be
  // the exact forked primitive this phase removes.
  assert.ok(
    !/<SerialCard\b/.test(SRC),
    'UnmatchedLineRow must not render a bare <SerialCard> — use ActiveLineConditionSerial',
  );
});
