/**
 * Unit tests for resolveTimelineSections — WorkspaceTimelineTab visibility plan.
 *
 *   npx tsx --test src/components/station/workbench/resolve-timeline-sections.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExplicitSerials,
  resolveTimelineSections,
} from './resolve-timeline-sections';

test('normalizeExplicitSerials: trims, drops empties, dedupes', () => {
  assert.deepEqual(normalizeExplicitSerials(['  A ', '', 'A', 'B']), ['A', 'B']);
  assert.deepEqual(normalizeExplicitSerials(undefined), []);
});

test('resolveTimelineSections: empty anchor → no content', () => {
  const plan = resolveTimelineSections({});
  assert.equal(plan.hasContent, false);
  assert.equal(plan.showCarrier, false);
  assert.equal(plan.showSerials, false);
  assert.equal(plan.carrierVia, null);
});

test('resolveTimelineSections: poId prefers PO carrier path', () => {
  const plan = resolveTimelineSections({
    poId: 'PO-1',
    tracking: '1Z999',
    orderId: 'ORD-1',
  });
  assert.equal(plan.showCarrier, true);
  assert.equal(plan.carrierVia, 'po');
  assert.equal(plan.hasContent, true);
});

test('resolveTimelineSections: tracking without po → tracking path', () => {
  const plan = resolveTimelineSections({ tracking: '1Z999' });
  assert.equal(plan.carrierVia, 'tracking');
  assert.equal(plan.showCarrier, true);
  assert.equal(plan.showSerials, false);
});

test('resolveTimelineSections: order without po/tracking → order path', () => {
  const plan = resolveTimelineSections({ orderId: 'ORD-9' });
  assert.equal(plan.carrierVia, 'order');
  assert.equal(plan.showCarrier, true);
});

test('resolveTimelineSections: explicit serials only', () => {
  const plan = resolveTimelineSections({ serials: ['SN1'] });
  assert.equal(plan.showCarrier, false);
  assert.equal(plan.showSerials, true);
  assert.equal(plan.fetchCartonSerials, false);
  assert.equal(plan.hasContent, true);
});

test('resolveTimelineSections: receivingId without serials → fetch carton', () => {
  const plan = resolveTimelineSections({ receivingId: 42 });
  assert.equal(plan.showSerials, true);
  assert.equal(plan.fetchCartonSerials, true);
  assert.equal(plan.hasContent, true);
});

test('resolveTimelineSections: explicit serials skip carton fetch', () => {
  const plan = resolveTimelineSections({ receivingId: 42, serials: ['SN1'] });
  assert.equal(plan.fetchCartonSerials, false);
  assert.equal(plan.showSerials, true);
});

test('resolveTimelineSections: carrier + serials both', () => {
  const plan = resolveTimelineSections({
    poId: 'PO-1',
    receivingId: 7,
    serials: ['SN1', 'SN2'],
  });
  assert.equal(plan.showCarrier, true);
  assert.equal(plan.showSerials, true);
  assert.equal(plan.carrierVia, 'po');
  assert.equal(plan.fetchCartonSerials, false);
});
