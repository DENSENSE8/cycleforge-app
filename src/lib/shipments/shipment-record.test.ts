import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  buildShipmentRecord,
  getShipmentRecord,
  type ShipmentRecordRows,
  type ShipmentStationRow,
  type ShipmentStnRow,
} from './shipment-record';

const ORG = '00000000-0000-0000-0000-00000000000a' as OrgId;

function stn(over: Partial<ShipmentStnRow> = {}): ShipmentStnRow {
  return {
    id: '43308',
    tracking_number_raw: '1Z23A1E90339190802',
    carrier: 'UPS',
    latest_status_category: 'IN_TRANSIT',
    latest_status_label: 'In Transit',
    latest_status_description: null,
    latest_event_at: new Date('2026-08-28T23:43:00Z'),
    is_delivered: false,
    has_exception: false,
    label_created_at: null,
    carrier_accepted_at: null,
    first_in_transit_at: null,
    out_for_delivery_at: null,
    delivered_at: null,
    exception_at: null,
    last_checked_at: null,
    last_error_code: null,
    last_error_message: null,
    ...over,
  };
}

function station(over: Partial<ShipmentStationRow> & Pick<ShipmentStationRow, 'id' | 'activity_type'>): ShipmentStationRow {
  return {
    created_at: new Date('2026-08-28T23:00:00Z'),
    station: 'OUTBOUND',
    scan_ref: '1Z23A1E90339190802',
    staff_id: 1,
    staff_name: 'Michael',
    metadata: null,
    notes: null,
    orders_exception_id: null,
    serial_number: null,
    ...over,
  };
}

function rows(over: Partial<ShipmentRecordRows> = {}): ShipmentRecordRows {
  return {
    stn: stn(),
    items: [],
    serials: [],
    packs: [],
    boxes: [],
    station: [],
    exceptions: [],
    audits: [],
    carrier: [],
    inventory: [],
    photos: [],
    ...over,
  };
}

test('an ops-backfilled scan-out is flagged backfilled on shipOut and on its action', () => {
  const record = buildShipmentRecord(
    rows({
      station: [
        station({ id: 34135, activity_type: 'SHIP_CONFIRM', metadata: { source: 'ops-backfill-scan-out', staff_id: 1 } }),
      ],
    }),
  );

  assert.deepEqual(record.shipOut, {
    at: '2026-08-28T23:00:00.000Z',
    staffId: 1,
    staffName: 'Michael',
    backfilled: true,
  });
  const action = record.actions.find((a) => a.id === 'station:34135');
  assert.equal(action?.label, 'Scan-out backfilled');
});

test('a live dock scan-out is not backfilled, and the NEWEST scan-out is the shipOut', () => {
  const record = buildShipmentRecord(
    rows({
      // Loader order: newest first.
      station: [
        station({ id: 2, activity_type: 'SHIP_CONFIRM', created_at: '2026-08-29T01:00:00Z', staff_id: 7, staff_name: 'Ana', metadata: { source: 'scan-out' } }),
        station({ id: 1, activity_type: 'SHIP_CONFIRM', metadata: { source: 'ops-backfill-scan-out' } }),
      ],
    }),
  );

  assert.equal(record.shipOut?.backfilled, false);
  assert.equal(record.shipOut?.staffName, 'Ana');
  assert.equal(record.shipOut?.at, '2026-08-29T01:00:00.000Z');
});

test('actions merge every source newest first, and equal instants keep a stable order', () => {
  const record = buildShipmentRecord(
    rows({
      stn: stn({ id: 52848, tracking_number_raw: '1Z23A1E90383534572' }),
      packs: [
        { id: 6210, packed_by: 4, packer_name: 'Tuan', packed_at: new Date('2026-08-24T23:10:09Z'), sal_id: 32217 },
      ],
      station: [
        station({
          id: 32217,
          activity_type: 'PACK_COMPLETED',
          station: 'PACK',
          created_at: new Date('2026-08-24T23:10:09Z'),
          staff_id: 4,
          staff_name: 'Tuan',
          orders_exception_id: 3371,
        }),
      ],
      exceptions: [
        {
          id: 3371,
          exception_reason: 'not_found',
          status: 'open',
          notes: 'Packer scan: tracking not found in orders',
          source_station: 'packer',
          staff_name: 'Tuan',
          created_at: new Date('2026-08-24T23:10:09.278Z'),
        },
      ],
      carrier: [
        {
          id: 9,
          event_occurred_at: new Date('2026-08-25T18:40:34Z'),
          normalized_status_category: 'IN_TRANSIT',
          external_status_label: null,
          external_status_description: 'Departed facility',
          event_city: 'Ontario',
          event_state: 'CA',
          exception_description: null,
          signed_by: null,
        },
      ],
      audits: [
        // Audit twin of the PACK scan: already on the ledger, must not repeat.
        {
          id: 'a1',
          created_at: new Date('2026-08-24T23:10:09Z'),
          action: 'PACK_COMPLETED',
          entity_type: 'PACKER_LOG',
          entity_id: '6210',
          actor_staff_id: 4,
          actor_name: 'Tuan',
          station_activity_log_id: 32217,
          after_data: null,
          metadata: null,
        },
      ],
    }),
  );

  assert.deepEqual(
    record.actions.map((a) => a.id),
    ['carrier:9', 'exception:3371', 'station:32217'],
  );
  const pack = record.actions[2];
  assert.equal(pack.label, 'Packed — no matching order');
  assert.equal(record.pack?.packerName, 'Tuan');
  assert.equal(record.pack?.packedAt, '2026-08-24T23:10:09.000Z');
  assert.equal(record.exception?.status, 'open');

  const tie = buildShipmentRecord(
    rows({
      station: [
        station({ id: 5, activity_type: 'SERIAL_ADDED', created_at: '2026-08-01T00:00:00Z', serial_number: 'SN5' }),
        station({ id: 6, activity_type: 'SERIAL_ADDED', created_at: '2026-08-01T00:00:00Z', serial_number: 'SN6' }),
      ],
    }),
  );
  assert.deepEqual(tie.actions.map((a) => a.id), ['station:6', 'station:5']);
});

test('a pack log with no station twin still appears as a Packed action', () => {
  const record = buildShipmentRecord(
    rows({
      packs: [{ id: 77, packed_by: 3, packer_name: 'Thuy', packed_at: '2026-07-29T16:59:36Z', sal_id: null }],
    }),
  );

  assert.deepEqual(
    record.actions.map((a) => [a.id, a.label, a.actorName]),
    [['station:packer_log-77', 'Packed', 'Thuy']],
  );
});

test('box k of N counts the order boxes in box_seq order, not the raw sequence value', () => {
  const box = (id: number, seq: number | null) => ({
    shipment_id: id,
    tracking: `T${id}`,
    box_seq: seq,
    is_primary: seq === 8,
    packed_at: null,
    packer_name: null,
    shipped_at: null,
  });
  const record = buildShipmentRecord(
    rows({ boxes: [box(43309, 9), box(43308, 8), box(43311, 10)] }),
  );

  assert.deepEqual(record.box, { seq: 1, isPrimary: true, total: 3 });
  assert.deepEqual(
    record.siblings.map((s) => [s.shipmentId, s.boxSeq]),
    [[43309, 2], [43311, 3]],
  );
});

test('getShipmentRecord is null for a package the org cannot see', async () => {
  const seen: Array<[OrgId, number]> = [];
  const out = await getShipmentRecord(ORG, 43308, {
    loadRows: async (orgId, id) => {
      seen.push([orgId, id]);
      return null;
    },
  });

  assert.equal(out, null);
  assert.deepEqual(seen, [[ORG, 43308]]);
});
