/**
 * The `inventory.units` DEFINITION — identity and shell recipe.
 *
 * ## Why this replaced a guard
 *
 * `units-grid-sheet.guard.test.ts` asserted the same three facts and then seven
 * more by `readFileSync`-ing `UnitsWorkspaceView.tsx` and regex-matching which
 * chrome primitive it composed (`<NonlinearTableHost`, `WORKBENCH_SHEET_HOST`,
 * `WORKBENCH_SHEET_CHROME`). That is the class of test `AGENTS.md` records as
 * deleted on 2026-08-22: it cannot tell an import from the same word in a
 * comment, and it pins a SHAPE rather than a behaviour, so it fails the moment
 * the surface legitimately moves. The display teardown moved it
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md`), and the guard failed exactly
 * as predicted.
 *
 * What survives is the part that was never about source text: the definition is
 * data, so its identity and shell recipe can be asserted on the value itself.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNITS_TABLE_DEFINITION } from '@/components/inventory/units-grid/units-table-definition';

describe('inventory.units table definition', () => {
  it('declares its identity and the flush sheet recipe', () => {
    assert.equal(UNITS_TABLE_DEFINITION.id, 'inventory.units');
    assert.equal(UNITS_TABLE_DEFINITION.tableId, 'inventory-units');
    // `sheet` — the flush plane every ops queue mounts, not a raised card.
    assert.equal(UNITS_TABLE_DEFINITION.surface, 'sheet');
  });
});
