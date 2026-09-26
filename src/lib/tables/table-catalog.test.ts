import assert from 'node:assert/strict';
import test from 'node:test';

import { PRODUCT_TABLES } from './table-catalog';
import { REGISTERED_BINDINGS } from '@/components/tables/registered-bindings';

/** `PRODUCT_TABLES` is a server-safe restatement of `REGISTERED_BINDINGS` (see `table-catalog.ts` for why the route cannot import the… */

/** Distinct prefs buckets in the registry — two bindings may share one sheet. */
function registryTableIds(): string[] {
  return [...new Set(REGISTERED_BINDINGS.map((b) => b.definition.tableId))];
}

test('the catalog names exactly the registry\'s sheets', () => {
  assert.deepEqual(
    [...PRODUCT_TABLES.map((t) => t.tableId)].sort(),
    registryTableIds().sort(),
    'PRODUCT_TABLES and REGISTERED_BINDINGS disagree — a sheet in only one is ' +
      'either unenableable or a picker entry that opens nothing. Add it to BOTH.',
  );
});

test('every entry carries a human label', () => {
  for (const entry of PRODUCT_TABLES) {
    assert.ok(entry.label.trim().length > 0, `${entry.tableId} has no label`);
    // The picker shows these; a raw prefs-bucket id ("tech-all") is not a name
    // an operator can act on.
    assert.notEqual(entry.label, entry.tableId, `${entry.tableId}'s label is just its id`);
  }
});

test('no duplicate table ids', () => {
  const ids = PRODUCT_TABLES.map((t) => t.tableId);
  assert.equal(new Set(ids).size, ids.length, 'a duplicate would render twice in the picker');
});
