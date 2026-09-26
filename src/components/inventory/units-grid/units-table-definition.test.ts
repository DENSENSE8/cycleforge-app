/** The `inventory.units` DEFINITION — identity and shell recipe. */

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
