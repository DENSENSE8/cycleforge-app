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
  receivingRailCartonKey,
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

  it('drops the pending stub, upserts the carton-keyed row, purges triage, fires touch-scan', () => {
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
      'pending scan: stub must be dropped',
    );
    const carton = unboxed.find((r) => r.receiving_id === 42);
    assert.ok(carton, 'carton row upserted onto Unboxed');
    assert.equal(carton.client_event_id, receivingRailCartonKey(42));

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
