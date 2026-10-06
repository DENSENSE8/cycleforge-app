import test from 'node:test';
import assert from 'node:assert/strict';
import type { NavLocateEntry } from '@/lib/nav/context/schema';
import { fulfilledMobileHref, fulfilledMobileSections } from './fulfilled-card-model';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const HOUR = 3_600_000;

function entry(ref: string, bucket: string, facts: Record<string, unknown>): NavLocateEntry {
  // Only the facts the phone card reads; the rest of the row is irrelevant here.
  return { ref, key: `order:${ref}`, buckets: [bucket], title: null, detail: null, recordHref: null, facts } as unknown as NavLocateEntry;
}

const iso = (ms: number) => new Date(ms).toISOString();

test('splits into Act now · Watch · Done, worst clock first', () => {
  const sections = fulfilledMobileSections(
    [
      entry('111-0000001', 'stalled', { shipmentId: 1, clock: { since: iso(NOW - 10 * HOUR), due: iso(NOW + 62 * HOUR) } }),
      entry('111-0000002', 'no_movement', { shipmentId: 2, clock: { since: iso(NOW - 80 * HOUR), due: iso(NOW - 8 * HOUR) } }),
      entry('111-0000003', 'in_transit', { shipmentId: 3, clock: { since: iso(NOW - HOUR), due: iso(NOW + 71 * HOUR) } }),
      entry('111-0000004', 'happy', { shipmentId: 4, clock: { since: iso(NOW - HOUR), due: null } }),
      entry('111-0000005', 'not_a_bucket', {}),
    ],
    NOW,
  );
  assert.deepEqual(
    sections.map((s) => [s.id, s.cards.map((c) => c.bucket)]),
    [
      ['act', ['no_movement', 'stalled']],
      ['watch', ['in_transit']],
      ['done', ['happy']],
    ],
  );
  const worst = sections[0].cards[0].model.deadline;
  assert.equal(worst.tone, 'late');
  assert.match(worst.face, /^No movement · 3d \/ 3d$/);
});

test('a carrier stage opens the package; a check-in stage opens its Support item, else the package', () => {
  assert.equal(fulfilledMobileHref(entry('1', 'stalled', { shipmentId: 9, checkIn: { supportItemId: 4 } })), '/m/shipping/shipments/9');
  assert.equal(fulfilledMobileHref(entry('1', 'reply_due', { shipmentId: 9, checkIn: { supportItemId: 4 } })), '/m/t/4');
  assert.equal(fulfilledMobileHref(entry('1', 'check_in_due', { shipmentId: 9, checkIn: { supportItemId: null } })), '/m/shipping/shipments/9');
  assert.equal(fulfilledMobileHref(entry('1', 'delivered', {})), null);
});
