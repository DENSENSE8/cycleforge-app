import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ShipStationV1Shipment } from '@/lib/shipping/shipstation/orders-v1';
import {
  attachShipStationTracking,
  planShipStationTracking,
  type ShipStationOrderRow,
  type ShipStationTrackingDeps,
} from './shipstation-tracking';

/**
 * DB-free: ShipStation `/shipments` → one primary tracking per order, and the
 * attach against fake order rows.
 * Run: node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/integrations/connectors/shipstation-tracking.test.ts
 */

const ORG = '00000000-0000-0000-0000-00000000000a' as OrgId;

let nextId = 1000;
function shipment(over: Partial<ShipStationV1Shipment>): ShipStationV1Shipment {
  nextId += 1;
  return {
    shipmentId: nextId,
    orderId: 1,
    orderNumber: '100',
    createDate: '2026-09-20T10:00:00.0000000',
    shipDate: '2026-09-20',
    trackingNumber: '9400111899223197428490',
    carrierCode: 'stamps_com',
    serviceCode: 'usps_ground_advantage',
    isReturnLabel: false,
    voided: false,
    shipmentCost: null,
    insuranceCost: null,
    ...over,
  };
}

test('plan: voided labels are dropped and counted; a voided re-label never beats the live one', () => {
  const live = shipment({ orderNumber: 'A', trackingNumber: 'LIVE1', createDate: '2026-09-20T10:00:00' });
  const voidedLater = shipment({ orderNumber: 'A', trackingNumber: 'VOID1', createDate: '2026-09-21T10:00:00', voided: true });
  const onlyVoided = shipment({ orderNumber: 'B', trackingNumber: 'VOID2', voided: true });
  const { plans, voided } = planShipStationTracking([live, voidedLater, onlyVoided]);
  assert.equal(voided, 2);
  assert.deepEqual(
    plans.map((p) => [p.orderNumber, p.trackingNumber]),
    [['A', 'LIVE1']],
    'an order whose only label is voided gets no plan',
  );
});

test('plan: carrier code maps through shipStationCarrierToStored; unknown codes defer to the detector (null)', () => {
  const { plans } = planShipStationTracking([
    shipment({ orderNumber: 'U', carrierCode: 'stamps_com' }),
    shipment({ orderNumber: 'W', carrierCode: 'ups_walleted', trackingNumber: '1Z999AA10123456784' }),
    shipment({ orderNumber: 'X', carrierCode: 'some_regional_courier', trackingNumber: 'RC123' }),
  ]);
  assert.deepEqual(
    plans.map((p) => [p.orderNumber, p.carrier]),
    [
      ['U', 'USPS'],
      ['W', 'UPS'],
      ['X', null],
    ],
  );
});

test('plan: several labels on one order → the latest-created live label is primary; ties go to the higher shipmentId', () => {
  const older = shipment({ orderNumber: 'M', trackingNumber: 'OLD', createDate: '2026-09-20T08:00:00' });
  const newest = shipment({ orderNumber: 'M', trackingNumber: 'NEW', createDate: '2026-09-20T09:30:00' });
  const tieLow = shipment({ orderNumber: 'T', shipmentId: 5, trackingNumber: 'TIE-LOW', createDate: '2026-09-20T08:00:00' });
  const tieHigh = shipment({ orderNumber: 'T', shipmentId: 6, trackingNumber: 'TIE-HIGH', createDate: '2026-09-20T08:00:00' });

  // Feed order must not matter.
  for (const feed of [
    [older, newest, tieLow, tieHigh],
    [tieHigh, newest, tieLow, older],
  ]) {
    const { plans } = planShipStationTracking(feed);
    assert.deepEqual(
      plans.map((p) => [p.orderNumber, p.trackingNumber]),
      [
        ['M', 'NEW'],
        ['T', 'TIE-HIGH'],
      ],
    );
  }
});

test('plan: return labels, blank tracking, and blank order numbers are skipped, never primary', () => {
  const outbound = shipment({ orderNumber: 'R', trackingNumber: 'OUT', createDate: '2026-09-20T08:00:00' });
  const laterReturn = shipment({ orderNumber: 'R', trackingNumber: 'RET', createDate: '2026-09-22T08:00:00', isReturnLabel: true });
  const { plans, skipped } = planShipStationTracking([
    outbound,
    laterReturn,
    shipment({ orderNumber: 'N', trackingNumber: null }),
    shipment({ orderNumber: '  ', trackingNumber: 'ORPHAN' }),
  ]);
  assert.equal(skipped, 3);
  assert.deepEqual(plans.map((p) => p.trackingNumber), ['OUT']);
});

type FakeRow = Omit<ShipStationOrderRow, 'accountSource'> & { accountSource?: string | null };

function fakeDeps(fakeRows: FakeRow[], failOn: Set<string> = new Set()) {
  // Rows default to the ShipStation source; cross-source tests name theirs.
  const rows: ShipStationOrderRow[] = fakeRows.map((r) => ({ accountSource: 'shipstation', ...r }));
  const findCalls: Array<{ orgId: OrgId; orderNumbers: string[] }> = [];
  const attachCalls: Array<{ orgId: OrgId; orderIds: number[]; trackingNumber: string; carrier: string | null }> = [];
  const errors: string[] = [];
  const deps: ShipStationTrackingDeps = {
    findOrders: async (orgId, orderNumbers) => {
      findCalls.push({ orgId, orderNumbers });
      return rows.filter((r) => orderNumbers.includes(r.orderNumber));
    },
    // Catalog placement: 'ECWID'/'ecwid' are one platform, everything else its own.
    platformOf: (source) => (source ?? '').trim().toLowerCase() || null,
    attachPrimaryTracking: async (input) => {
      if (failOn.has(input.trackingNumber)) throw new Error('Tracking number already exists on another shipment');
      attachCalls.push(input);
    },
    onError: (orderNumber) => {
      errors.push(orderNumber);
    },
  };
  return { deps, findCalls, attachCalls, errors };
}

test('attach: org threads to lookup and write; unknown orders are ignored and counted', async () => {
  const { plans } = planShipStationTracking([
    shipment({ orderNumber: 'KNOWN', trackingNumber: '9400111899223197428490', carrierCode: 'stamps_com' }),
    shipment({ orderNumber: 'GHOST', trackingNumber: '1Z999AA10123456784', carrierCode: 'ups' }),
  ]);
  const { deps, findCalls, attachCalls } = fakeDeps([
    { orderNumber: 'KNOWN', orderRowId: 42, currentTracking: null },
  ]);

  const result = await attachShipStationTracking(ORG, plans, deps);

  assert.deepEqual(findCalls, [{ orgId: ORG, orderNumbers: ['GHOST', 'KNOWN'] }]);
  assert.deepEqual(attachCalls, [
    { orgId: ORG, orderIds: [42], trackingNumber: '9400111899223197428490', carrier: 'USPS' },
  ]);
  assert.equal(result.attached, 1);
  assert.equal(result.unmatched, 1);
  assert.deepEqual(result.attachedOrderIds, [42]);
});

test('attach: the ShipStation order ref pairs first; else one platform\'s rows; rows across platforms are left alone', async () => {
  const { plans } = planShipStationTracking([
    shipment({ orderNumber: 'ADOPTED', trackingNumber: 'T-ADOPTED' }),
    shipment({ orderNumber: 'REF', orderId: 555, trackingNumber: 'T-REF' }),
    shipment({ orderNumber: 'MIXED', trackingNumber: 'T-MIXED' }),
  ]);
  const { deps, attachCalls } = fakeDeps([
    { orderNumber: 'ADOPTED', orderRowId: 11, accountSource: 'ecwid', currentTracking: null },
    { orderNumber: 'ADOPTED', orderRowId: 12, accountSource: 'ECWID', currentTracking: null },
    // Two platforms carry REF, but the refs record which row ShipStation order 555 landed on.
    { orderNumber: 'REF', orderRowId: 21, accountSource: 'Amazon', currentTracking: null },
    { orderNumber: 'REF', orderRowId: 22, accountSource: 'Walmart', currentTracking: null, shipStationOrderIds: [555] },
    { orderNumber: 'MIXED', orderRowId: 31, accountSource: 'Amazon', currentTracking: null },
    { orderNumber: 'MIXED', orderRowId: 32, accountSource: 'Walmart', currentTracking: null },
  ]);

  const result = await attachShipStationTracking(ORG, plans, deps);

  assert.deepEqual(
    attachCalls.map((c) => [c.trackingNumber, c.orderIds]),
    [
      ['T-ADOPTED', [11, 12]],
      ['T-REF', [22]],
    ],
  );
  assert.equal(result.ambiguous, 1);
  assert.equal(result.unmatched, 0);
  assert.deepEqual(
    result.outcomes.find((o) => o.status === 'ambiguous')?.orderRowIds,
    [],
    'an ambiguous plan names no rows',
  );
});

test('attach dry-run: counts what it would attach and writes nothing', async () => {
  const { plans } = planShipStationTracking([shipment({ orderNumber: 'NEW', trackingNumber: 'T-NEW' })]);
  const { deps, attachCalls } = fakeDeps([{ orderNumber: 'NEW', orderRowId: 7, accountSource: 'eBay', currentTracking: null }]);
  const result = await attachShipStationTracking(ORG, plans, deps, { dryRun: true });
  assert.equal(result.attached, 1);
  assert.equal(attachCalls.length, 0);
  assert.deepEqual(result.attachedOrderIds, [], 'no cache bust for a write that did not happen');
});

test('attach: an order already carrying the tracking (normalized) is not rewritten; a different one is replaced', async () => {
  const { plans } = planShipStationTracking([
    shipment({ orderNumber: 'SAME', trackingNumber: '9400 1118 9922 3197 4284 90' }),
    shipment({ orderNumber: 'DIFF', trackingNumber: '9400111899223197428506' }),
  ]);
  const { deps, attachCalls } = fakeDeps([
    { orderNumber: 'SAME', orderRowId: 1, currentTracking: '9400111899223197428490' },
    { orderNumber: 'DIFF', orderRowId: 2, currentTracking: '9400111899223197400000' },
  ]);

  const result = await attachShipStationTracking(ORG, plans, deps);

  assert.equal(result.alreadyCurrent, 1);
  assert.equal(result.attached, 1);
  assert.deepEqual(attachCalls.map((c) => c.orderIds), [[2]]);
});

test('attach: every row of a multi-row order gets the tracking in one call; one failing order never stops the rest', async () => {
  const { plans } = planShipStationTracking([
    shipment({ orderNumber: 'MULTI', trackingNumber: 'T-MULTI' }),
    shipment({ orderNumber: 'BAD', trackingNumber: 'T-BAD' }),
    shipment({ orderNumber: 'OK', trackingNumber: 'T-OK' }),
  ]);
  const { deps, attachCalls, errors } = fakeDeps(
    [
      { orderNumber: 'MULTI', orderRowId: 9, currentTracking: null },
      { orderNumber: 'MULTI', orderRowId: 3, currentTracking: 'T-MULTI' },
      { orderNumber: 'BAD', orderRowId: 4, currentTracking: null },
      { orderNumber: 'OK', orderRowId: 5, currentTracking: null },
    ],
    new Set(['T-BAD']),
  );

  const result = await attachShipStationTracking(ORG, plans, deps);

  assert.deepEqual(
    attachCalls.map((c) => [c.trackingNumber, c.orderIds]),
    [
      ['T-MULTI', [3, 9]],
      ['T-OK', [5]],
    ],
    'a partially-tracked order is re-applied across all its rows',
  );
  assert.equal(result.failed, 1);
  assert.deepEqual(errors, ['BAD']);
  assert.deepEqual(result.attachedOrderIds, [3, 9, 5]);
});

test('attach: no plans → no lookup at all', async () => {
  const { deps, findCalls } = fakeDeps([]);
  const result = await attachShipStationTracking(ORG, [], deps);
  assert.equal(findCalls.length, 0);
  assert.equal(result.attached + result.unmatched + result.failed + result.alreadyCurrent, 0);
});
