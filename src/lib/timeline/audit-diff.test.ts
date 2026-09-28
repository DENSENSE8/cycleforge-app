import test from 'node:test';
import assert from 'node:assert/strict';
import { diffChanges, humanizeAuditKey } from './audit-diff';

test('diffChanges: changed keys only, humanized to sentence case', () => {
  const changes = diffChanges(
    { status: 'open', shipQty: 1, carrier_code: 'ups', note: 'same' },
    { status: 'closed', shipQty: 2, carrier_code: 'usps', note: 'same' },
  );
  assert.deepEqual(changes, [
    { key: 'Status', before: 'open', after: 'closed' },
    { key: 'Ship qty', before: '1', after: '2' },
    { key: 'Carrier code', before: 'ups', after: 'usps' },
  ]);
});

test('diffChanges: one-sided payload yields NO changes (the gating contract)', () => {
  // Missing `before` (creation, OR a redacted non-admin request) → nothing.
  assert.deepEqual(diffChanges(null, { status: 'closed' }), []);
  assert.deepEqual(diffChanges(undefined, { status: 'closed' }), []);
  // Missing `after` (deletion) → nothing.
  assert.deepEqual(diffChanges({ status: 'open' }, null), []);
});

test('diffChanges: null ↔ value boundaries carry a null side (renders —); null → null is unchanged', () => {
  const changes = diffChanges(
    { a: 1, tracking: null, cleared: 'x', gone: null, blank: '' },
    { a: 1, tracking: '1Z99', cleared: null, gone: null, blank: null, added: 2 },
  );
  assert.deepEqual(changes, [
    { key: 'Tracking', before: null, after: '1Z99' },
    { key: 'Cleared', before: 'x', after: null },
    { key: 'Added', before: null, after: '2' },
  ]);
});

test('diffChanges: nested objects flatten one level; unchanged nested keys skipped; never raw JSON', () => {
  const changes = diffChanges(
    { pairing: null, meta: { x: 1, same: 'v' } },
    { pairing: { sku: 'B0F3XYZ', qty: 1 }, meta: { x: 2, same: 'v' } },
  );
  assert.deepEqual(changes, [
    { key: 'Pairing sku', before: null, after: 'B0F3XYZ' },
    { key: 'Pairing qty', before: null, after: '1' },
    { key: 'Meta x', before: '1', after: '2' },
  ]);
  for (const c of changes) {
    assert.doesNotMatch(`${c.before} ${c.after}`, /[{}"]/);
  }
});

test('diffChanges: deeper objects and arrays render as readable text', () => {
  const changes = diffChanges(
    { tags: ['a'], empty: ['x'], dims: { box: { lengthIn: 10 } }, ok: false },
    { tags: ['a', 'b'], empty: [], dims: { box: { lengthIn: 12 } }, ok: true },
  );
  assert.deepEqual(changes, [
    { key: 'Tags', before: 'a', after: 'a, b' },
    { key: 'Empty', before: 'x', after: null },
    { key: 'Dims box', before: 'Length in: 10', after: 'Length in: 12' },
    { key: 'Ok', before: 'No', after: 'Yes' },
  ]);
});

test('diffChanges: equal arrays and objects are skipped', () => {
  assert.deepEqual(
    diffChanges({ tags: ['a', 'b'], meta: { x: 1 } }, { tags: ['a', 'b'], meta: { x: 1 } }),
    [],
  );
});

test('diffChanges: caps the number of rows, including flattened ones', () => {
  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  for (let i = 0; i < 50; i++) {
    before[`k${i}`] = i;
    after[`k${i}`] = i + 1;
  }
  assert.equal(diffChanges(before, after, 12).length, 12);
  assert.equal(diffChanges({ n: { a: 1, b: 1, c: 1 } }, { n: { a: 2, b: 2, c: 2 } }, 2).length, 2);
});

test('humanizeAuditKey: snake, camel and kebab → sentence case', () => {
  assert.equal(humanizeAuditKey('pairing_sku'), 'Pairing sku');
  assert.equal(humanizeAuditKey('pairingSku'), 'Pairing sku');
  assert.equal(humanizeAuditKey('ship-by-date'), 'Ship by date');
  assert.equal(humanizeAuditKey('status'), 'Status');
});
