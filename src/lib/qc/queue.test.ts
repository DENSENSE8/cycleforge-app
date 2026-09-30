import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { listQcQueue, type QcQueueDeps, type QcQueueRawResult, type QcQueueRawUnit } from './queue';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

function raw(serialUnitId: number, over: Partial<QcQueueRawUnit> = {}): QcQueueRawUnit {
  return {
    serial_unit_id: serialUnitId,
    receiving_id: 500 + serialUnitId,
    receiving_line_id: 900 + serialUnitId,
    qc_state: 'PENDING',
    unit_status: 'RECEIVED',
    carton_is_return: false,
    carton_intake_type: 'PO',
    carton_source: 'zoho_po',
    carton_is_priority: false,
    line_receiving_type: 'PO',
    line_intake_type: 'po',
    line_is_repair_service: false,
    line_has_repair_fact: false,
    unboxed_at: '2026-09-01T10:00:00-07:00',
    bin: null,
    dock_location: null,
    serial: `SN${serialUnitId}`,
    sku: '00097',
    item_name: 'PO line text',
    catalog_product_title: null,
    image_url: null,
    listing_cover_photo_id: null,
    ...over,
  };
}

function fakes(result: QcQueueRawResult) {
  const calls: { orgId: OrgId; params: readonly unknown[] }[] = [];
  const deps: QcQueueDeps = {
    query: async (orgId, _sql, params) => {
      calls.push({ orgId, params });
      return { rows: [result] };
    },
  };
  return { deps, calls };
}

test('the read is org-scoped and asks only for units still wanting a verdict on the receiving side', async () => {
  const { deps, calls } = fakes({ done_today: 0, units: [] });
  await listQcQueue({ orgId: ORG, staffId: 7 }, deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].orgId, ORG);
  const [org, staff, qcStates, unitStatuses] = calls[0].params;
  assert.equal(org, ORG);
  assert.equal(staff, 7);
  assert.deepEqual(qcStates, ['PENDING', 'TEST_AGAIN']);
  // Past QC (STOCKED, SHIPPED, TESTED, ON_HOLD, …) never reaches the queue.
  assert.deepEqual(unitStatuses, ['RECEIVED', 'TRIAGED', 'IN_TEST']);
});

test('a missing or non-positive staff id asks for no done count rather than another tech’s', async () => {
  const { deps, calls } = fakes({ done_today: null, units: [] });
  const out = await listQcQueue({ orgId: ORG, staffId: 0 }, deps);
  assert.equal(calls[0].params[1], null);
  assert.equal(out.doneToday, 0);
});

test('units come back tiered and sorted, capped, with the true total and every tier counted', async () => {
  const { deps } = fakes({
    done_today: '4',
    units: [
      raw(1),
      raw(2, { carton_source: 'unmatched' }),
      raw(3, { carton_is_return: true }),
      raw(4, { carton_is_priority: true }),
      raw(5, { line_is_repair_service: true }),
    ],
  });
  const out = await listQcQueue({ orgId: ORG, staffId: 7, limit: 3 }, deps);
  assert.deepEqual(
    out.units.map((unit) => [unit.serialUnitId, unit.tier]),
    [
      [3, 'return'],
      [5, 'repair'],
      [2, 'unfound'],
    ],
  );
  assert.equal(out.total, 5);
  assert.deepEqual(out.tierCounts, { return: 1, repair: 1, unfound: 1, pickup: 0, retest: 0, qc: 2 });
  assert.equal(out.doneToday, 4);
});

test('the card facts: catalog title over the PO text, bin and dock kept apart, listing cover when the line has no photo', async () => {
  const { deps } = fakes({
    done_today: 0,
    units: [
      raw(1, {
        catalog_product_title: 'Bose SoundDock 10',
        bin: '  ',
        dock_location: 'Returns — Testing',
        listing_cover_photo_id: 77,
      }),
      raw(2, { image_url: '/api/items/2/image', listing_cover_photo_id: 77 }),
    ],
  });
  const [unit, withPhoto] = (await listQcQueue({ orgId: ORG, staffId: 7 }, deps)).units;
  assert.equal(unit.title, 'Bose SoundDock 10');
  assert.equal(withPhoto.title, 'PO line text');
  assert.equal(unit.bin, null);
  assert.equal(unit.dockLocation, 'Returns — Testing');
  assert.match(unit.photoUrl ?? '', /77/);
  assert.equal(withPhoto.photoUrl, '/api/items/2/image');
});
