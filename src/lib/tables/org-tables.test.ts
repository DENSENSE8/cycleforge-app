import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enabledOrgTables,
  orphanedOrgTables,
  resolveOrgCatalog,
  type CatalogEntry,
  type OrgTableRow,
} from './org-tables';

const OFFERED: CatalogEntry[] = [
  { tableId: 'orders', label: 'To-ship' },
  { tableId: 'receiving', label: 'Unbox' },
  { tableId: 'repair', label: 'Repair' },
];

test('an org with NO stored rows gets every table, in the shipped order', () => {
  // The load-bearing rule: absence means ALL. If this inverted, applying the
  // migration would blank every existing tenant's tab strip.
  const resolved = resolveOrgCatalog(OFFERED, []);
  assert.deepEqual(
    resolved.map((e) => e.tableId),
    ['orders', 'receiving', 'repair'],
  );
  assert.ok(resolved.every((e) => e.enabled));
  assert.ok(resolved.every((e) => !e.explicit));
});

test('enabled=false is an explicit opt-out, distinct from an absent row', () => {
  const stored: OrgTableRow[] = [{ tableId: 'repair', enabled: false, sortOrder: 2 }];
  const resolved = resolveOrgCatalog(OFFERED, stored);
  const repair = resolved.find((e) => e.tableId === 'repair')!;
  assert.equal(repair.enabled, false);
  assert.equal(repair.explicit, true, 'the org said no — that is not the default');
  assert.deepEqual(
    enabledOrgTables(OFFERED, stored).map((e) => e.tableId),
    ['orders', 'receiving'],
  );
});

test('resolve returns every offered table so the picker can show what is off', () => {
  const stored: OrgTableRow[] = [{ tableId: 'repair', enabled: false, sortOrder: 2 }];
  assert.equal(resolveOrgCatalog(OFFERED, stored).length, 3);
  assert.equal(enabledOrgTables(OFFERED, stored).length, 2);
});

test('stored sort order wins, and ties break totally', () => {
  const stored: OrgTableRow[] = [
    { tableId: 'repair', enabled: true, sortOrder: 0 },
    { tableId: 'orders', enabled: true, sortOrder: 0 },
  ];
  // Both at 0 → tie broken on tableId, so the order is deterministic rather
  // than whatever the array happened to arrive in.
  assert.deepEqual(
    resolveOrgCatalog(OFFERED, stored).map((e) => e.tableId),
    ['orders', 'repair', 'receiving'],
  );
});

test('an unstored table keeps its position in the product list', () => {
  const stored: OrgTableRow[] = [{ tableId: 'repair', enabled: true, sortOrder: 0 }];
  // `receiving` is unstored at index 1; `orders` unstored at index 0.
  assert.deepEqual(
    resolveOrgCatalog(OFFERED, stored).map((e) => e.tableId),
    ['orders', 'repair', 'receiving'],
  );
});

test('a stored row for a retired table never reaches the strip', () => {
  const stored: OrgTableRow[] = [
    { tableId: 'orders', enabled: true, sortOrder: 0 },
    { tableId: 'a-table-that-was-deleted', enabled: true, sortOrder: 1 },
  ];
  assert.ok(
    !resolveOrgCatalog(OFFERED, stored).some(
      (e) => e.tableId === 'a-table-that-was-deleted',
    ),
    'an unopenable tab must never appear',
  );
  assert.deepEqual(orphanedOrgTables(OFFERED, stored), ['a-table-that-was-deleted']);
});

test('no offered tables yields nothing, not a throw', () => {
  assert.deepEqual(resolveOrgCatalog([], []), []);
  assert.deepEqual(enabledOrgTables([], [{ tableId: 'x', enabled: true, sortOrder: 0 }]), []);
});
