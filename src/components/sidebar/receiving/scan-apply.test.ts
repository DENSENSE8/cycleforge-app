import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { applyUnboxCartonOpened } from './scan-apply';
import {
  buildPendingScanStubRow,
  pendingScanReconcileKey,
} from './receiving-sidebar-shared';
import {
  TRIAGE_RAIL_SEGMENTS,
  UNBOX_RAIL_SEGMENT,
  receivingRailShipmentKey,
  type ReceivingRailRow,
} from '@/lib/queries/receiving-queries';

function railKey(segment: string) {
  return ['receiving-lines-table', 'rail', segment, 'default', '', 'all'] as const;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch() {
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = ((url: string, init?: { body?: string }) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch;
  return calls;
}

describe('applyUnboxCartonOpened (the unbox-open chokepoint)', () => {
  const TRACKING = '1Z999TEST0001';

  it('UPGRADES the pending stub in place (one row, one key), purges triage, fires touch-scan', () => {
    const calls = stubFetch();
    const qc = new QueryClient();
    // Pre-resolve pending stub on the Unboxed rail (painted at scan submit).
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [buildPendingScanStubRow(TRACKING)]);
    // Carton sits in a triage rail (the phantom-Arrival setup).
    for (const segment of TRIAGE_RAIL_SEGMENTS) {
      qc.setQueryData(railKey(segment), [
        { id: -42, receiving_id: 42, client_event_id: 'carton:42' },
      ] satisfies ReceivingRailRow[]);
    }

    applyUnboxCartonOpened(qc, {
      receivingId: 42,
      trackingNumber: TRACKING,
      // Rich row, as every real call site passes (a bare identity row would be
      // rejected by mergeRailRows' identity-only "no Line # stub" guard).
      railRow: { id: 7, receiving_id: 42, item_name: 'Widget', quantity_received: 1 } as ReceivingRailRow,
      touchScan: { tracking: 'CARTON-OWN-TRACKING' },
    });

    const unboxed = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT));
    assert.ok(unboxed);
    assert.equal(
      unboxed.some((r) => r.client_event_id === pendingScanReconcileKey(TRACKING)),
      false,
      'legacy scan: stub must be swept',
    );
    const carton = unboxed.find((r) => r.receiving_id === 42);
    assert.ok(carton, 'carton row on Unboxed');
    // THE regression this test exists for:
    assert.equal(carton.client_event_id, receivingRailShipmentKey(TRACKING));
    assert.equal(unboxed.length, 1, 'stub was upgraded, not duplicated');

    for (const segment of TRIAGE_RAIL_SEGMENTS) {
      assert.deepEqual(qc.getQueryData(railKey(segment)), [], `triage ${segment} purged`);
      assert.equal(qc.getQueryState(railKey(segment))?.isInvalidated, true);
    }

    assert.equal(calls.length, 1, 'exactly one touch-scan POST');
    assert.equal(calls[0].url, '/api/receiving/touch-scan');
    assert.deepEqual(calls[0].body, {
      receiving_id: 42,
      tracking_number: 'CARTON-OWN-TRACKING',
      intakeSurface: 'unbox',
    });
  });

  it('lookup-po flavor: no touchScan → no POST (server already stamped)', () => {
    const calls = stubFetch();
    const qc = new QueryClient();

    applyUnboxCartonOpened(qc, {
      receivingId: 42,
      trackingNumber: TRACKING,
      railRow: { id: 7, receiving_id: 42 },
    });

    assert.equal(calls.length, 0);
  });

  it('Phase-0 flavor: no railRow → no Unboxed insert, purge still runs', () => {
    stubFetch();
    const qc = new QueryClient();
    qc.setQueryData(railKey('triage-combined'), [
      { id: -42, receiving_id: 42, client_event_id: 'carton:42' },
    ] satisfies ReceivingRailRow[]);

    applyUnboxCartonOpened(qc, {
      receivingId: 42,
      trackingNumber: TRACKING,
      touchScan: {},
    });

    assert.equal(qc.getQueryData(railKey(UNBOX_RAIL_SEGMENT)), undefined);
    assert.deepEqual(qc.getQueryData(railKey('triage-combined')), []);
  });
});

describe('applyUnboxCartonOpened — a LOOKUP is read-only against the rail', () => {
  const TRACKING = '1Z999LOOKUP001';

  it('does not upsert the carton or purge triage when the work is already done', () => {
    const calls = stubFetch();
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [buildPendingScanStubRow(TRACKING)]);
    for (const segment of TRIAGE_RAIL_SEGMENTS) {
      qc.setQueryData(railKey(segment), [
        { id: -42, receiving_id: 42, client_event_id: 'carton:42' },
      ] satisfies ReceivingRailRow[]);
    }

    applyUnboxCartonOpened(qc, {
      receivingId: 42,
      trackingNumber: TRACKING,
      railRow: { id: 7, receiving_id: 42, item_name: 'Widget', quantity_received: 1 } as ReceivingRailRow,
      touchScan: { tracking: 'CARTON-OWN-TRACKING' },
      // The carton was unboxed weeks ago — this scan is an inspection.
      unboxedAt: '2026-07-10T18:03:00.000Z',
    });

    // The carton must NOT appear on the Unboxed rail: upserting it bumps a
    // weeks-old box to the top as if it had just been opened.
    const unboxed = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT)) ?? [];
    assert.equal(
      unboxed.some((r) => r.receiving_id === 42),
      false,
      'a lookup upserted the carton onto the Unboxed rail',
    );

    // Triage rails keep the carton — evicting it from Arrival because someone
    // *looked* at the box is a real data loss for the next operator.
    for (const segment of TRIAGE_RAIL_SEGMENTS) {
      const rows = qc.getQueryData<ReceivingRailRow[]>(railKey(segment)) ?? [];
      assert.equal(rows.length, 1, `a lookup purged the ${segment} rail`);
    }

    // Our own optimistic stub is still cleaned up — it is our artifact. Both
    // keys are checked: a lookup upserts NOTHING, so the shipment-keyed stub has
    // no successor row and must not be spared the way the work path spares it.
    assert.equal(unboxed.length, 0, 'the pending scan stub survived a lookup');
    assert.equal(
      unboxed.some(
        (r) =>
          r.client_event_id === pendingScanReconcileKey(TRACKING)
          || r.client_event_id === receivingRailShipmentKey(TRACKING),
      ),
      false,
      'the pending scan stub survived a lookup',
    );

    // touch-scan STILL fires: it is what records RECEIVING_LOOKUP_SCAN for the
    // client short-circuit rungs. Skipping it leaves the inspection unlogged.
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/receiving\/touch-scan/);
  });
});
