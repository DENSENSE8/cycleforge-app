/**
 * Contract for WORK vs LOOKUP scan classification.
 *
 * Run: `npx tsx --test src/lib/receiving/unbox-scan-kind.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECEIVING_LOOKUP_SCAN_EVENT,
  cachedLookupUnboxedAt,
  classifyScanKind,
  classifyUnboxScanKind,
  lookupScanClientEventId,
} from './unbox-scan-kind';

test('a never-opened carton is work (the first open IS the work)', () => {
  assert.equal(classifyUnboxScanKind({ unboxedAt: null }), 'work');
  assert.equal(classifyUnboxScanKind({ unboxedAt: undefined }), 'work');
});

test('an opened-but-not-unboxed carton is still work (resuming mid-unbox)', () => {
  // The carton has an `opened_at` but no `unboxed_at`. Keying on opened_at
  // instead would misclassify an operator re-scanning the box in their hands.
  assert.equal(classifyUnboxScanKind({ unboxedAt: null }), 'work');
});

test('an unboxed carton is a lookup', () => {
  assert.equal(classifyUnboxScanKind({ unboxedAt: '2026-07-10T18:03:00.000Z' }), 'lookup');
  assert.equal(classifyUnboxScanKind({ unboxedAt: new Date('2026-07-10') }), 'lookup');
});

test('an unboxed carton still owed units is work — the next box of a multi-box PO', () => {
  // One PO, ten boxes, one carton: box 1 stamps unboxed_at; box 2 must open the work, not a "done" receipt.
  assert.equal(classifyUnboxScanKind({ unboxedAt: '2026-10-06T08:07:01.000Z', unitsOutstanding: true }), 'work');
  assert.equal(classifyUnboxScanKind({ unboxedAt: '2026-10-06T08:07:01.000Z', unitsOutstanding: false }), 'lookup');
});

test('a cached row only short-circuits to lookup once its line owes no units', () => {
  const unboxedAt = '2026-10-06T08:07:01.000Z';
  assert.equal(cachedLookupUnboxedAt({ unboxed_at: unboxedAt, quantity_expected: 2, quantity_received: 0 }), null);
  assert.equal(cachedLookupUnboxedAt({ unboxed_at: unboxedAt, quantity_expected: 2, quantity_received: 2 }), unboxedAt);
  assert.equal(cachedLookupUnboxedAt({ unboxed_at: unboxedAt, quantity_expected: 2, quantity_received: 0, workflow_status: 'DONE' }), unboxedAt);
  assert.equal(cachedLookupUnboxedAt({ unboxed_at: null, quantity_expected: 1, quantity_received: 1 }), null);
});

test('triage door scans are always work, even on an unboxed carton', () => {
  assert.equal(classifyScanKind('triage', { unboxedAt: '2026-07-10T18:03:00.000Z' }), 'work');
  assert.equal(classifyScanKind('unbox', { unboxedAt: '2026-07-10T18:03:00.000Z' }), 'lookup');
});

test('the lookup event type is distinct from the work events', () => {
  assert.equal(RECEIVING_LOOKUP_SCAN_EVENT, 'RECEIVING_LOOKUP_SCAN');
  assert.notEqual(RECEIVING_LOOKUP_SCAN_EVENT, 'UNBOX_SCAN_OPENED');
  assert.notEqual(RECEIVING_LOOKUP_SCAN_EVENT, 'TRACKING_SCANNED');
});

test('lookup client-event ids are unique per occurrence, stable per request', () => {
  const base = { organizationId: 'org-1', receivingId: 482 };
  const a = lookupScanClientEventId({ ...base, occurredAtIso: '2026-07-28T10:00:00.000Z' });
  const b = lookupScanClientEventId({ ...base, occurredAtIso: '2026-07-28T11:00:00.000Z' });
  // Two lookups a week apart are two facts — unlike the work events, which are
  // keyed on the stable scan-row id and dedupe across re-scans.
  assert.notEqual(a, b);
  // Same request retried → same id, so idempotency still holds where it should.
  assert.equal(a, lookupScanClientEventId({ ...base, occurredAtIso: '2026-07-28T10:00:00.000Z' }));
});

test('lookup client-event ids are org- and carton-scoped', () => {
  const at = '2026-07-28T10:00:00.000Z';
  assert.notEqual(
    lookupScanClientEventId({ organizationId: 'org-1', receivingId: 482, occurredAtIso: at }),
    lookupScanClientEventId({ organizationId: 'org-2', receivingId: 482, occurredAtIso: at }),
  );
  assert.notEqual(
    lookupScanClientEventId({ organizationId: 'org-1', receivingId: 482, occurredAtIso: at }),
    lookupScanClientEventId({ organizationId: 'org-1', receivingId: 999, occurredAtIso: at }),
  );
});
