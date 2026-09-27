import test from 'node:test';
import assert from 'node:assert/strict';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { deriveShippingDisplayMeta, findDuplicateTrackingInDraft } from './helpers';

function makeShipped(overrides: Record<string, unknown>): ShippedOrder {
  return { id: 1, ...overrides } as unknown as ShippedOrder;
}

test('deriveShippingDisplayMeta: prefers explicit name columns over staff lookup', () => {
  const meta = deriveShippingDisplayMeta(
    makeShipped({ packed_by_name: 'Alice', tested_by_name: 'Bob' }),
    [],
  );
  assert.equal(meta.packerNameDisplay, 'Alice');
  assert.equal(meta.techNameDisplay, 'Bob');
});

test('deriveShippingDisplayMeta: falls back to "Not specified" when no name resolves', () => {
  const meta = deriveShippingDisplayMeta(makeShipped({ packed_by: null, tested_by: null }), []);
  assert.equal(meta.packerNameDisplay, 'Not specified');
  assert.equal(meta.techNameDisplay, 'Not specified');
});

test('deriveShippingDisplayMeta: not scanned out → null name, honest-absence display', () => {
  const meta = deriveShippingDisplayMeta(makeShipped({}), []);
  assert.equal(meta.isScannedOut, false);
  assert.equal(meta.scannedOutByDisplay, null);
  assert.equal(meta.scannedOutDisplay, '—');
});

test('deriveShippingDisplayMeta: scanned out (sentinel "1" is not a real timestamp)', () => {
  assert.equal(deriveShippingDisplayMeta(makeShipped({ ship_confirmed_at: '1' }), []).isScannedOut, false);
  assert.equal(
    deriveShippingDisplayMeta(makeShipped({ ship_confirmed_at: '2026-06-20T10:00:00Z', shipped_out_by_name: 'Dock' }), []).isScannedOut,
    true,
  );
});

test('deriveShippingDisplayMeta: packedAtSource prefers pack_activity_at, ignores "1" sentinel', () => {
  assert.equal(
    deriveShippingDisplayMeta(makeShipped({ pack_activity_at: '2026-06-20T10:00:00Z', packed_at: '2026-06-19T10:00:00Z' }), []).packedAtSource,
    '2026-06-20T10:00:00Z',
  );
  assert.equal(
    deriveShippingDisplayMeta(makeShipped({ pack_activity_at: '1', packed_at: '2026-06-19T10:00:00Z' }), []).packedAtSource,
    '2026-06-19T10:00:00Z',
  );
  assert.equal(deriveShippingDisplayMeta(makeShipped({ pack_activity_at: '1', packed_at: '1' }), []).packedAtSource, null);
});

test('deriveShippingDisplayMeta: copy text includes serials joined, em dash when empty', () => {
  const withSerials = deriveShippingDisplayMeta(makeShipped({ order_id: 'ORD-9' }), ['SN1', 'SN2']);
  assert.match(withSerials.returnsCopyText, /Order ID: ORD-9/);
  assert.match(withSerials.returnsCopyText, /Serials: SN1, SN2/);

  const noSerials = deriveShippingDisplayMeta(makeShipped({ order_id: '' }), []);
  assert.match(noSerials.returnsCopyText, /Order ID: —/);
  assert.match(noSerials.returnsCopyText, /Serials: —/);
});

test('findDuplicateTrackingInDraft: null when unique or blank', () => {
  assert.equal(findDuplicateTrackingInDraft(['1ZAAA', '1ZBBB']), null);
  assert.equal(findDuplicateTrackingInDraft([{ tracking: '1ZAAA' }, { tracking: '' }]), null);
  assert.equal(findDuplicateTrackingInDraft([]), null);
});

test('findDuplicateTrackingInDraft: case-insensitive duplicate', () => {
  assert.equal(findDuplicateTrackingInDraft(['1Zaaa111', '1ZAAA111']), '1ZAAA111');
});

test('findDuplicateTrackingInDraft: punctuation-normalized key collision', () => {
  // Same canonical key after strip — hyphenated vs continuous.
  const dup = findDuplicateTrackingInDraft([
    { tracking: '1Z72304672306723076' },
    { tracking: '1Z-723046-72306723076' },
  ]);
  assert.ok(dup);
});

test('deriveShippingDisplayMeta: testedAtSource falls back through activity/event (serial-less test scan)', () => {
  // Serial scans present → test_date_time wins.
  assert.equal(
    deriveShippingDisplayMeta(makeShipped({ test_date_time: '2026-07-13T10:00:00Z', test_activity_at: '2026-07-13T11:00:00Z' }), []).testedAtSource,
    '2026-07-13T10:00:00Z',
  );
  // No serial scan (test_date_time null) but a test station-activity stamp → use it.
  assert.equal(
    deriveShippingDisplayMeta(makeShipped({ test_date_time: null, test_activity_at: '2026-07-13T11:00:00Z' }), []).testedAtSource,
    '2026-07-13T11:00:00Z',
  );
  // Then the event stamp.
  assert.equal(
    deriveShippingDisplayMeta(makeShipped({ test_date_time: null, test_activity_at: null, test_event_at: '2026-07-13T12:00:00Z' }), []).testedAtSource,
    '2026-07-13T12:00:00Z',
  );
  // Legacy '1' sentinel and blanks are not stamps.
  assert.equal(
    deriveShippingDisplayMeta(makeShipped({ test_date_time: '1', test_activity_at: '', test_event_at: null }), []).testedAtSource,
    null,
  );
});
