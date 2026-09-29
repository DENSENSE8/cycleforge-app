/** The bulk-paste residual report — DB-free, via the injected lookup. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveTrackingRemovalStatus } from './tracking-removal-status';
import { CHECK_ZOHO_RECEIVED_MAX_INPUTS } from './tracking-paste';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const DAY = 86_400_000;
const NOW = Date.parse('2026-08-02T12:00:00Z');
const now = () => NOW;

/** Minimal row builder — every field the resolver reads, nothing more. */
function hit(canon: string, over: Record<string, unknown> = {}) {
  return {
    canon,
    delivered: false,
    delivered_at: null,
    scanned: false,
    unboxed: false,
    written_off: false,
    zoho_status: null,
    zoho_status_synced_at: null,
    po_number: null,
    receiving_id: null,
    ...over,
  };
}

const deps = (rows: ReturnType<typeof hit>[]) => ({
  lookup: async () => rows as never,
  now,
});

test('a key with no inbound shipment is NOT FOUND — never silently dropped', () => {
  return resolveTrackingRemovalStatus(ORG, '1Z999AA101\n9400111899223344556677', deps([
    hit('1Z999AA101'),
  ])).then((res) => {
    assert.deepEqual(res.not_found, ['9400111899223344556677']);
    assert.equal(res.stats.not_found, 1);
    assert.equal(res.stats.applied, 2);
    // Found-but-still-on-the-lane is neither residual: it is simply in the table.
    assert.deepEqual(res.hidden, []);
  });
});

test('a found key that left the lane is HIDDEN, with its reason', async () => {
  const res = await resolveTrackingRemovalStatus(ORG, 'AAA11111\nBBB22222', deps([
    hit('AAA11111', { delivered: true, scanned: true, unboxed: true }),
    hit('BBB22222', { zoho_status: 'received' }),
  ]));

  assert.deepEqual(res.not_found, []);
  assert.equal(res.hidden.length, 2);
  assert.deepEqual(
    res.hidden.map((r) => [r.key, r.reason]),
    [['AAA11111', 'unboxed'], ['BBB22222', 'vendor_received']],
  );
});

test('a cancelled PO is reported as cancelled, not as received', async () => {
  const res = await resolveTrackingRemovalStatus(ORG, 'CCC33333', deps([
    hit('CCC33333', { zoho_status: 'cancelled' }),
  ]));
  assert.equal(res.hidden[0]?.reason, 'vendor_cancelled');
});

test('aged-out is computed against the hunt window, not guessed', async () => {
  const stale = new Date(NOW - 30 * DAY).toISOString();
  const fresh = new Date(NOW - 2 * DAY).toISOString();

  const aged = await resolveTrackingRemovalStatus(ORG, 'DDD44444', deps([
    hit('DDD44444', { delivered: true, delivered_at: stale }),
  ]));
  assert.equal(aged.hidden[0]?.reason, 'aged_out');

  // Still inside the window = still on the hunt queue = not removed at all.
  const recent = await resolveTrackingRemovalStatus(ORG, 'DDD44444', deps([
    hit('DDD44444', { delivered: true, delivered_at: fresh }),
  ]));
  assert.deepEqual(recent.hidden, []);
  assert.equal(recent.rows[0]?.reason, null);
});

test('the report reads back the ORIGINAL paste string, not the canonical key', async () => {
  // The operator pasted `1z999-aa1 01`; echoing `1Z999AA101` back at them makes
  // a matching row look like a different number.
  const res = await resolveTrackingRemovalStatus(ORG, '1z999-aa1 01', deps([
    hit('1Z999AA101', { unboxed: true, delivered: true }),
  ]));
  assert.equal(res.rows[0]?.tracking, '1z999-aa1 01');
  assert.equal(res.rows[0]?.key, '1Z999AA101');
});

test('over-cap truncation is REPORTED in the stats, not swallowed', async () => {
  const requested = CHECK_ZOHO_RECEIVED_MAX_INPUTS + 37;
  const many = Array.from({ length: requested }, (_, i) => `TRACK${String(i).padStart(6, '0')}`).join('\n');
  const res = await resolveTrackingRemovalStatus(ORG, many, deps([]));
  assert.equal(res.stats.requested, requested);
  assert.equal(res.stats.applied, CHECK_ZOHO_RECEIVED_MAX_INPUTS);
  assert.equal(res.stats.truncated, 37);
});

test('an empty paste asks the database nothing', async () => {
  let called = false;
  const res = await resolveTrackingRemovalStatus(ORG, '   \n,,', {
    lookup: async () => {
      called = true;
      return [] as never;
    },
    now,
  });
  assert.equal(called, false, 'no keys means no query');
  assert.deepEqual(res.rows, []);
  assert.equal(res.stats.applied, 0);
});

test('the lookup failure PROPAGATES — it must not read as "none of these exist"', async () => {
  await assert.rejects(
    resolveTrackingRemovalStatus(ORG, 'EEE55555', {
      lookup: async () => {
        throw new Error('db down');
      },
      now,
    }),
    /db down/,
  );
});
