/**
 * Run: npx tsx --test src/lib/tasks/throw-targets.test.ts
 *
 * Every case here is a wrong-record bug the panel cannot see: the resolve
 * response looks identical in shape whether the number in it is a carton, a
 * repair ticket or a line.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveThrowTargets } from './throw-targets';

test('a printed carton handle resolves to its carton', () => {
  const targets = resolveThrowTargets({
    kind: 'package',
    entity: { handleType: 'receiving', redirect: '/m/r/4471', value: 'R-4471' },
  });
  assert.deepEqual(targets, [{ entityType: 'receiving', entityId: 4471, label: 'Carton 4471' }]);
});

test('an absolute printed URL resolves the same as the bare handle', () => {
  // `entity.value` carries the whole scanned string; the id is only ever in the
  // redirect, which is why the parse is anchored on the path and not the value.
  const targets = resolveThrowTargets({
    kind: 'package',
    entity: {
      handleType: 'receiving',
      redirect: '/m/r/4471',
      value: 'https://usav.app.cycleforge.ai/m/r/4471',
    },
  });
  assert.equal(targets[0]?.entityId, 4471);
});

test('a REPAIR short-form is refused, not thrown at the carton of the same id', () => {
  // routeScan types `RS-88` as `receiving` but redirects to /m/rs/88, where 88
  // is a repair service id. A loose match here hands someone carton #88.
  const targets = resolveThrowTargets({
    kind: 'package',
    entity: { handleType: 'receiving', redirect: '/m/rs/88', value: 'RS-88' },
  });
  assert.deepEqual(targets, []);
});

test('a receiving-LINE handle yields nothing — a line is not a carton', () => {
  const targets = resolveThrowTargets({
    kind: 'package',
    entity: { handleType: 'receiving-line', redirect: '/m/l/902', value: 'L-902' },
  });
  assert.deepEqual(targets, []);
});

test('a plain PO number uses the id the route already looked up, and names the PO', () => {
  const targets = resolveThrowTargets({
    kind: 'package',
    entity: { receivingId: 4471, po: 'PO-00812' },
  });
  assert.deepEqual(targets, [
    { entityType: 'receiving', entityId: 4471, label: 'PO PO-00812', sublabel: 'Carton 4471' },
  ]);
});

test('a PO branch with no PO number still names the carton honestly', () => {
  const targets = resolveThrowTargets({ entity: { receivingId: 12, po: null } });
  assert.deepEqual(targets, [{ entityType: 'receiving', entityId: 12, label: 'Carton 12' }]);
});

test('order matches become order targets, newest-first, deduped', () => {
  // The tracking and serial lookups can both surface the same row.
  const targets = resolveThrowTargets({
    kind: 'tracking',
    matches: [
      { id: 9, order_id: '115-2938', product_title: 'Bose QC45' },
      { id: 9, order_id: '115-2938', product_title: 'Bose QC45' },
      { id: 4, order_id: '114-0001', product_title: null },
    ],
  });
  assert.deepEqual(targets, [
    { entityType: 'order', entityId: 9, label: '115-2938', sublabel: 'Bose QC45' },
    { entityType: 'order', entityId: 4, label: '114-0001' },
  ]);
});

test('a carton leads its order matches — a sticker names one record, a search does not', () => {
  const targets = resolveThrowTargets({
    entity: { receivingId: 4471, po: 'PO-1' },
    matches: [{ id: 9, order_id: '115-2938' }],
  });
  assert.deepEqual(
    targets.map((t) => t.entityType),
    ['receiving', 'order'],
  );
});

test('bigint-as-string ids survive (node-postgres returns them as strings)', () => {
  const targets = resolveThrowTargets({ matches: [{ id: '77', order_id: 'A-1' }] });
  assert.deepEqual(targets, [{ entityType: 'order', entityId: 77, label: 'A-1' }]);
});

test('an unresolvable scan yields nothing rather than a plausible guess', () => {
  assert.deepEqual(resolveThrowTargets({ kind: 'unknown', matches: [] }), []);
  assert.deepEqual(resolveThrowTargets({ kind: 'location', entity: { handleType: 'bin' } }), []);
  assert.deepEqual(resolveThrowTargets(null), []);
  assert.deepEqual(resolveThrowTargets({}), []);
});

test('junk ids are dropped, not coerced', () => {
  assert.deepEqual(
    resolveThrowTargets({
      entity: { receivingId: 0 },
      matches: [{ id: -3, order_id: 'x' }, { id: 'abc', order_id: 'y' }, { id: 1.5, order_id: 'z' }],
    }),
    [],
  );
});
