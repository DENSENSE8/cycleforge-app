/** The Unboxed rail's row identity is SHIPMENT-first, and this pins why. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  isReceivingRailShipmentKey,
  receivingRailCartonKey,
  receivingRailRowKey,
  receivingRailShipmentKey,
} from './rail-carton-key';
import { transformUnboxOpenedRows } from './unbox-opened-rows';

const TRACKING = '1Z999AA10123456784';

function row(patch: Partial<ReceivingLineRow> & { id: number }): ReceivingLineRow {
  return { receiving_id: null, tracking_number: null, ...patch } as ReceivingLineRow;
}

describe('receivingRailRowKey — the shipment-first ladder', () => {
  it('a pending stub and its resolved carton land on ONE key', () => {
    // t=0: tracking only, no carton yet.
    const pending = receivingRailRowKey({ tracking_number: TRACKING, receiving_id: null });
    // t=1: same shipment, carton now known.
    const resolved = receivingRailRowKey({ tracking_number: TRACKING, receiving_id: 42 });
    assert.equal(pending, resolved);
    assert.ok(isReceivingRailShipmentKey(String(pending)));
  });

  it('canonicalizes, so a dashed/spaced scan keys the same as the stored value', () => {
    assert.equal(
      receivingRailShipmentKey('1z999-aa1 0123456784'),
      receivingRailShipmentKey(TRACKING),
    );
  });

  it('falls back to the carton when there is no shipment — the typed-order# path', () => {
    // An order#/PO scan resolves a carton that may carry no carrier tracking at
    // all (local pickup, walk-in). That row was never the flickering case, and
    // it keeps carton identity.
    assert.equal(
      receivingRailRowKey({ tracking_number: null, receiving_id: 42 }),
      receivingRailCartonKey(42),
    );
    assert.equal(receivingRailRowKey({ tracking_number: '   ', receiving_id: 7 }), 'carton:7');
  });

  it('falls back to the line id last — never an empty key', () => {
    assert.equal(receivingRailRowKey({ id: 9 }), 9);
  });
});

describe('transformUnboxOpenedRows — feed rows agree with the optimistic rows', () => {
  it('stamps the shipment key, so the authoritative refetch does not remount the row', () => {
    const [out] = transformUnboxOpenedRows([
      row({ id: 1, receiving_id: 42, tracking_number: TRACKING }),
    ]);
    assert.equal(out.client_event_id, receivingRailShipmentKey(TRACKING));
  });

  it('keeps the carton key for a trackingless carton', () => {
    const [out] = transformUnboxOpenedRows([row({ id: 1, receiving_id: 42 })]);
    assert.equal(out.client_event_id, receivingRailCartonKey(42));
  });

  it('two cartons on ONE tracking never collide on a React key', () => {
    // `resolveShipmentForScan` resolves a tracking to at most one carton, but
    // nothing in the schema makes `receiving_carton.shipment_id` unique — so the
    // second carton falls back to its own key rather than duplicating the first.
    const out = transformUnboxOpenedRows([
      row({ id: 1, receiving_id: 42, tracking_number: TRACKING }),
      row({ id: 2, receiving_id: 43, tracking_number: TRACKING }),
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0].client_event_id, receivingRailShipmentKey(TRACKING));
    assert.equal(out[1].client_event_id, receivingRailCartonKey(43));
    assert.notEqual(out[0].client_event_id, out[1].client_event_id);
  });
});
