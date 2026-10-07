import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { applyUnboxCartonOpened } from './scan-apply';
import { buildPendingScanRow } from './receiving-sidebar-shared';
import {
  TRIAGE_RAIL_SEGMENT,
  UNBOX_RAIL_SEGMENT,
  receivingRailShipmentKey,
  upsertReceivingRailRows,
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
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [buildPendingScanRow(TRACKING)]);
    // Carton sits on the Arrival rail (the phantom-Arrival setup).
    qc.setQueryData(railKey(TRIAGE_RAIL_SEGMENT), [
      { id: -42, receiving_id: 42, client_event_id: 'carton:42' },
    ] satisfies ReceivingRailRow[]);

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
      unboxed.some((r) => r.receiving_id == null),
      false,
      'the pending row must not outlive the open',
    );
    const carton = unboxed.find((r) => r.receiving_id === 42);
    assert.ok(carton, 'carton row on Unboxed');
    // THE regression this test exists for:
    assert.equal(carton.client_event_id, receivingRailShipmentKey(TRACKING));
    assert.equal(unboxed.length, 1, 'stub was upgraded, not duplicated');

    assert.deepEqual(qc.getQueryData(railKey(TRIAGE_RAIL_SEGMENT)), [], 'Arrival rail purged');
    assert.equal(qc.getQueryState(railKey(TRIAGE_RAIL_SEGMENT))?.isInvalidated, true);

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
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), [buildPendingScanRow(TRACKING)]);
    qc.setQueryData(railKey(TRIAGE_RAIL_SEGMENT), [
      { id: -42, receiving_id: 42, client_event_id: 'carton:42' },
    ] satisfies ReceivingRailRow[]);

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

    // The Arrival rail keeps the carton — evicting it because someone *looked*
    // at the box is a real data loss for the next operator.
    const arrival = qc.getQueryData<ReceivingRailRow[]>(railKey(TRIAGE_RAIL_SEGMENT)) ?? [];
    assert.equal(arrival.length, 1, 'a lookup purged the Arrival rail');

    // Our own pending row is still cleaned up — it is our artifact, and a
    // lookup upserts NOTHING, so it has no successor row to upgrade into.
    assert.equal(unboxed.length, 0, 'the pending scan row survived a lookup');

    // touch-scan STILL fires: it is what records RECEIVING_LOOKUP_SCAN for the
    // client short-circuit rungs. Skipping it leaves the inspection unlogged.
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/receiving\/touch-scan/);
  });
});

describe('re-scan of a carton already on the Unboxed rail', () => {
  const STORED = '9400100000382441843263';
  const IMPB = `42090210${STORED}`;

  function seededRail(): ReceivingRailRow[] {
    return [
      { id: 11, receiving_id: 41, client_event_id: 'stn:1ZAAA', workflow_status: 'DONE', unboxed_at: '2026-10-07T10:00:00Z', unbox_opened_at: '2026-10-07T10:00:00Z' },
      { id: 12, receiving_id: 42, client_event_id: receivingRailShipmentKey(STORED)!, workflow_status: 'DONE', unboxed_at: '2026-10-07T09:00:00Z', unbox_opened_at: '2026-10-07T09:00:00Z' },
      { id: 13, receiving_id: 43, client_event_id: 'stn:1ZCCC', workflow_status: 'UNBOXED', unbox_opened_at: '2026-10-07T08:00:00Z' },
    ] as ReceivingRailRow[];
  }
  const snapshot = (rows: ReceivingRailRow[] | undefined) =>
    (rows ?? []).map((r) => {
      const row = r as ReceivingRailRow & { workflow_status?: string | null; unboxed_at?: string | null };
      return [row.receiving_id, row.workflow_status, row.unboxed_at ?? null, row.client_event_id];
    });

  for (const [label, scanned] of [['same spelling', STORED], ['IMpb label spelling', IMPB]] as const) {
    it(`${label}: no row moves, no status change, no duplicate`, () => {
      stubFetch();
      const qc = new QueryClient();
      qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), seededRail());
      const before = snapshot(qc.getQueryData(railKey(UNBOX_RAIL_SEGMENT)));

      // A pending row can never land on the real carton row (same canonical key).
      upsertReceivingRailRows(qc, [buildPendingScanRow(scanned)]);
      // The open chokepoint, from every rung: the cache hit passes the row
      // itself; lookup-po passes an optimistic matched row with no status.
      applyUnboxCartonOpened(qc, {
        receivingId: 42,
        trackingNumber: scanned,
        railRow: { id: 12, receiving_id: 42, item_name: 'Widget', workflow_status: null, quantity_received: 0 } as ReceivingRailRow,
        touchScan: {},
        unboxedAt: '2026-10-07T09:00:00Z',
      });
      applyUnboxCartonOpened(qc, {
        receivingId: 42,
        trackingNumber: scanned,
        railRow: { id: 12, receiving_id: 42, item_name: 'Widget', workflow_status: null, quantity_received: 0 } as ReceivingRailRow,
      });

      assert.deepEqual(snapshot(qc.getQueryData(railKey(UNBOX_RAIL_SEGMENT))), before);
    });
  }

  it('hydration patches the carton in place and never adds a row', () => {
    const qc = new QueryClient();
    qc.setQueryData(railKey(UNBOX_RAIL_SEGMENT), seededRail());
    upsertReceivingRailRows(
      qc,
      [
        { id: 12, receiving_id: 42, item_name: 'Widget', quantity_received: 1 } as ReceivingRailRow,
        { id: 99, receiving_id: 99, item_name: 'Old box', quantity_received: 1 } as ReceivingRailRow,
      ],
      'patch',
    );
    const rows = qc.getQueryData<ReceivingRailRow[]>(railKey(UNBOX_RAIL_SEGMENT)) ?? [];
    assert.deepEqual(rows.map((r) => r.receiving_id), [41, 42, 43]);
  });
});
