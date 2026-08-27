/**
 * FBA board leaf-row fill — pins the two things that are easy to break by
 * reordering a `cn()` call.
 *
 * 1. **The board keeps its own row inset.** `ledgerRowFillClass` zeroes padding
 *    (`px-0 py-0`) because the grid families pad per cell; this board pads the
 *    row. That only holds while `px-3 py-3` is merged AFTER the helper — swap
 *    the two and every FBA row silently collapses to zero padding, with no type
 *    error and no guard to catch it.
 * 2. **Selection is fill-only.** The hand-typed chrome here used to be
 *    `bg-blue-50 ring-1 ring-inset ring-blue-400` — the LIST recipe on a surface
 *    that renders `gridSkin="airtable"`. Under continuous cell rules that inset
 *    ring reads as a top/right L-glow, which is why the SoT paints airtable
 *    selection as fill only (`source-of-truth.md` → one-row anatomy).
 *
 * Run: `npx tsx --test src/components/fba/fba-board-row-fill.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cn } from '@/utils/_cn';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { FBA_BOARD_GRID_CAPABILITIES } from '@/components/fba/fba-board-capabilities';

/** Mirrors the row className in `FbaBoardTable` — keep the ORDER identical. */
function rowClass(isSelected: boolean): string {
  return cn(
    'grid',
    ledgerRowFillClass({ selected: isSelected, capabilities: FBA_BOARD_GRID_CAPABILITIES }),
    'px-3 py-3',
    'focus-visible:ring-2',
  );
}

test('the board keeps its own row inset over the helper reset', () => {
  const c = rowClass(false);
  assert.ok(c.includes('px-3') && c.includes('py-3'), c);
  assert.ok(!/\bpx-0\b/.test(c), `px-0 survived — row padding collapsed: ${c}`);
  assert.ok(!/\bpy-0\b/.test(c), `py-0 survived — row padding collapsed: ${c}`);
});

test('selected paints fill only — no inset ring under airtable cell rules', () => {
  const c = rowClass(true);
  assert.ok(c.includes('bg-blue-50'), c);
  assert.ok(!c.includes('ring-inset'), `the list-recipe inset ring came back: ${c}`);
});

test('unselected keeps the card fill and hover feedback', () => {
  const c = rowClass(false);
  assert.ok(c.includes('bg-surface-card'), c);
  assert.ok(c.includes('hover:bg-surface-hover'), c);
});

test('the board cannot paint triage wash even if a flag is passed', () => {
  // `rowTriageFlags: false` — the capability gate ignores the class rather than
  // trusting the call site not to pass one.
  const flagged = cn(
    ledgerRowFillClass({
      selected: false,
      flagClass: 'bg-rose-50',
      capabilities: FBA_BOARD_GRID_CAPABILITIES,
    }),
  );
  assert.ok(!flagged.includes('bg-rose-50'), `triage wash leaked onto the FBA board: ${flagged}`);
});
