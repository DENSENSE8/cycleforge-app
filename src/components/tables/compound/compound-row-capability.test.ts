import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * **The shared row must be able to paint every shared cell.**
 *
 * This is the mechanical half of invariant 1 (`ENGINE_IS_MONOMORPHIC`). The
 * cells were shared long before the ROW was, and `CompoundRow` forwarded only
 * some of what `renderCompoundGridCell` accepts — so a family that wanted an
 * editable compound row could not use the shared row at all. It mapped the
 * columns itself and called the cell renderer directly, which is exactly how
 * `OrdersQueueTableRow` (1300 lines) came to be a family row component the law
 * forbids.
 *
 * The gap was invisible because nothing compared the two lists. This test is
 * that comparison: every ROW-LEVEL parameter the cell renderer takes must be a
 * prop `CompoundRow` accepts and forwards. A new cell capability that the row
 * does not forward is a new reason to write a family row, and it fails here on
 * the same run that adds it.
 *
 * Source-read rather than type-level on purpose: the forwarding is a runtime
 * fact (an omitted key type-checks fine, it just silently never arrives), which
 * is precisely the failure mode this is guarding.
 */

const CELL = 'src/components/tables/compound/CompoundGridCell.tsx';
const ROW = 'src/components/tables/compound/CompoundRow.tsx';

/**
 * Parameters the ROW computes per cell rather than receives — the only
 * legitimate reason a name is in the cell's list and not the row's props.
 */
const ROW_COMPUTED = new Set(['col', 'columns', 'rule', 'formatClass']);

/** The destructured parameter names of `renderCompoundGridCell`. */
function cellParamNames(): string[] {
  const src = readFileSync(CELL, 'utf8');
  const start = src.indexOf('export function renderCompoundGridCell');
  assert.ok(start >= 0, 'renderCompoundGridCell not found — did it move?');
  const open = src.indexOf('{', start);
  const close = src.indexOf('}: CompoundGridCellParams', open);
  assert.ok(close > open, 'could not read the destructured parameter list');
  return src
    .slice(open + 1, close)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

describe('the shared compound row can paint every shared compound cell', () => {
  const params = cellParamNames();

  it('reads a non-trivial parameter list (the parser still works)', () => {
    assert.ok(params.length > 10, `only parsed ${params.length} params`);
    for (const known of ['view', 'select', 'stageAssigns', 'shipByEdit']) {
      assert.ok(params.includes(known), `expected ${known} in the cell params`);
    }
  });

  it('CompoundRow accepts every row-level cell capability as a prop', () => {
    const row = readFileSync(ROW, 'utf8');
    const propsBlock = row.slice(
      row.indexOf('export interface CompoundRowProps'),
      row.indexOf('export function CompoundRow'),
    );
    const missing = params
      .filter((p) => !ROW_COMPUTED.has(p))
      .filter((p) => !new RegExp(`\\b${p}\\??:`).test(propsBlock));
    assert.deepEqual(
      missing,
      [],
      `CompoundRow has no prop for: ${missing.join(', ')} — a family would have to write its own row to use them`,
    );
  });

  it('CompoundRow FORWARDS every one of them to the cell renderer', () => {
    const row = readFileSync(ROW, 'utf8');
    const call = row.slice(
      row.indexOf('renderCompoundGridCell({'),
      row.indexOf('if (cell) return cell;'),
    );
    const missing = params
      .filter((p) => !ROW_COMPUTED.has(p))
      .filter((p) => !new RegExp(`\\b${p}\\s*[,:]`).test(call));
    assert.deepEqual(
      missing,
      [],
      `accepted but never forwarded: ${missing.join(', ')} — the prop would silently do nothing`,
    );
  });
});
