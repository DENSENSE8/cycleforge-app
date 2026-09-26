/**
 * Verbs bind to FIELDS, not to lanes — the mechanical half.
 *
 * `TABLE_ENGINE_LAW.verbsBindToFields`. This is the proof that replaces the
 * deleted `orderBulkActionKeys` assertions: what a surface offers is no longer
 * a list to compare against, it is the family catalog filtered by the facts the
 * rows resolve, with each verb's direction read off the row.
 *
 * The rows below are the two REAL shapes the outbound feeds broadcast — a
 * To-ship `ShippedOrder` (nothing packed, nothing scanned out) and a Shipped
 * `PackerRecord` (packed, SHIP_CONFIRM stamped, carrier in custody). One verb
 * declaration has to answer both, in opposite directions, with no lane input
 * anywhere in this file: there is no `orderView`, no route and no key list to
 * pass in, because there is nowhere left to pass one.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  offeredSelectionActions,
  resolveSelectionAction,
  type SelectionAction,
} from '@/lib/selection/selection-actions';
import {
  canScanOut,
  hasLeftBuilding,
  hasShippingPaperwork,
  isInBuilding,
  scanOutDirection,
  shipmentIdForScanOut,
  trackingForScanOut,
  type OutboundVerbRow,
} from '@/lib/selection/order-verb-state';
import { ORDERS_FIELD_CATALOG } from '@/lib/tables/field-catalog/orders';

/** To-ship: on the floor, no pack scan, no dock scan. */
const TO_SHIP: OutboundVerbRow = {
  packed_at: null,
  ship_confirmed_at: null,
  latest_status_category: 'LABEL_CREATED',
  shipment_id: 720_001,
  shipping_tracking_number: '9400111899223197100001',
  sku: 'ETR-1',
};

/** Shipped: packed, scanned out at the dock, carrier has it. */
const SHIPPED: OutboundVerbRow = {
  packed_at: '2026-07-20T18:00:00.000Z',
  ship_confirmed_at: '2026-07-20T23:10:00.000Z',
  latest_status_category: 'IN_TRANSIT',
  shipment_id: 720_002,
  shipping_tracking_number: '9400111899223197100002',
  sku: 'ETR-2',
};

/** Packed but not yet on the truck — the staged middle the lane list never had. */
const PACKED_STAGED: OutboundVerbRow = {
  packed_at: '2026-07-20T18:00:00.000Z',
  ship_confirmed_at: null,
  latest_status_category: 'LABEL_CREATED',
  shipment_id: 720_003,
  shipping_tracking_number: '9400111899223197100003',
  sku: 'ETR-3',
};

/**
 * The scan-out verb, exactly as the orders catalog declares it.
 *
 * `useDashboardBulkSelection` is a React hook wired to react-query, auth and
 * the router, so it is not mounted here. This test owns the behaviour.
 */
const scanOut: SelectionAction<OutboundVerbRow> = {
  key: 'scan-out',
  label: 'Scan out',
  writesField: 'orders.scanned_out',
  direction: scanOutDirection,
  directionLabels: { do: 'Mark scanned out', undo: 'Undo scan-out' },
  enabled: (rows) => rows.some((r) => canScanOut(r, scanOutDirection(r))),
  run: () => {},
};

describe('outbound row state — lifecycle, not route', () => {
  it('reads where the package is from the row alone', () => {
    assert.equal(isInBuilding(TO_SHIP), true);
    assert.equal(hasLeftBuilding(TO_SHIP), false);
    assert.equal(hasShippingPaperwork(TO_SHIP), false);

    assert.equal(isInBuilding(SHIPPED), false);
    assert.equal(hasLeftBuilding(SHIPPED), true);
    assert.equal(hasShippingPaperwork(SHIPPED), true);

    // Packed but not dispatched: prep is over, the paperwork exists. The old
    // two-way lane list could not express this row at all.
    assert.equal(isInBuilding(PACKED_STAGED), false);
    assert.equal(hasLeftBuilding(PACKED_STAGED), false);
    assert.equal(hasShippingPaperwork(PACKED_STAGED), true);
  });

  it('treats carrier custody as gone even with no dock scan', () => {
    // ORPHAN: the carrier took it without an internal scan-out. Undo, not do —
    // the direction follows the world, not our stamp.
    const orphan: OutboundVerbRow = { ...TO_SHIP, latest_status_category: 'ACCEPTED' };
    assert.equal(hasLeftBuilding(orphan), true);
    assert.equal(scanOutDirection(orphan), 'undo');
  });

  it('names the handle each direction writes through', () => {
    assert.equal(trackingForScanOut(TO_SHIP), '9400111899223197100001');
    assert.equal(shipmentIdForScanOut(SHIPPED), 720_002);
    assert.equal(trackingForScanOut({ ...TO_SHIP, shipping_tracking_number: '  ' }), null);
    assert.equal(shipmentIdForScanOut({ ...SHIPPED, shipment_id: 0 }), null);
  });
});

describe('scan-out — ONE declaration, both desks, direction from the row', () => {
  it('is offered on To-ship and on Shipped, because both resolve the field', () => {
    const resolvable = ORDERS_FIELD_CATALOG.map((f) => f.id);
    assert.ok(resolvable.includes('orders.scanned_out'));
    // Same catalog, same filter — the surface contributes nothing.
    assert.deepEqual(
      offeredSelectionActions([scanOut], resolvable).map((a) => a.key),
      ['scan-out'],
    );
  });

  it('is NOT offered where the rows cannot resolve the fact', () => {
    // A receiving-line mount: no orders facts, so no dock verb. This is the
    // whole gate — there is no lane name involved.
    assert.deepEqual(offeredSelectionActions([scanOut], ['receiving.qty']), []);
  });

  it('points DO on To-ship and UNDO on Shipped from the same object', () => {
    const onToShip = resolveSelectionAction(scanOut, [TO_SHIP]);
    assert.equal(onToShip.disabled, false);
    assert.equal(onToShip.direction, 'do');
    assert.equal(onToShip.label, 'Mark scanned out');

    const onShipped = resolveSelectionAction(scanOut, [SHIPPED]);
    assert.equal(onShipped.disabled, false);
    assert.equal(onShipped.direction, 'undo');
    assert.equal(onShipped.label, 'Undo scan-out');
  });

  it('a mixed selection resolves to the majority and NAMES the remainder', () => {
    // 4 still here, 1 gone → do, and the operator is told one will be skipped.
    const mixed = [TO_SHIP, TO_SHIP, TO_SHIP, TO_SHIP, SHIPPED];
    const resolved = resolveSelectionAction(scanOut, mixed);
    assert.equal(resolved.disabled, false, 'a mixed selection resolves, it does not hide');
    assert.equal(resolved.direction, 'do');
    assert.equal(resolved.minority.length, 1);
    assert.match(resolved.reason ?? '', /1 of 5 skipped/);

    // Flip the majority and the same verb turns around.
    const mostlyGone = [SHIPPED, SHIPPED, SHIPPED, TO_SHIP];
    const flipped = resolveSelectionAction(scanOut, mostlyGone);
    assert.equal(flipped.direction, 'undo');
    assert.equal(flipped.label, 'Undo scan-out');
    assert.match(flipped.reason ?? '', /1 of 4 skipped/);
  });

  it('is disabled with a reason when no row carries a handle', () => {
    const noHandle: OutboundVerbRow = { ...TO_SHIP, shipping_tracking_number: null, tracking_number: null };
    const resolved = resolveSelectionAction(scanOut, [noHandle]);
    assert.equal(resolved.disabled, true);
    assert.equal(resolved.reason, undefined, 'no disabledReason on this fixture');
  });
});

describe('resolveSelectionAction — the direction contract', () => {
  const oneWay: SelectionAction<OutboundVerbRow> = { key: 'copy', label: 'Copy', run: () => {} };

  it('leaves a one-way verb alone', () => {
    const resolved = resolveSelectionAction(oneWay, [TO_SHIP]);
    assert.equal(resolved.direction, undefined);
    assert.equal(resolved.label, 'Copy');
    assert.deepEqual(resolved.minority, []);
  });

  it('disables an already-done verb rather than hiding it, and says how many', () => {
    const oneShot: SelectionAction<OutboundVerbRow> = {
      key: 'pack',
      label: 'Packed',
      direction: (row) => (row.packed_at ? 'done' : 'do'),
      run: () => {},
    };
    const resolved = resolveSelectionAction(oneShot, [SHIPPED, PACKED_STAGED]);
    assert.equal(resolved.disabled, true);
    assert.match(resolved.reason ?? '', /All 2 rows are already packed/);
  });

  it('still applies the count and predicate gates before any direction', () => {
    const single: SelectionAction<OutboundVerbRow> = { ...scanOut, maxSelected: 1 };
    const resolved = resolveSelectionAction(single, [TO_SHIP, SHIPPED]);
    assert.equal(resolved.disabled, true);
    assert.equal(resolved.direction, undefined, 'a gated verb resolves no direction');
  });
});

describe('offeredSelectionActions — the replacement for the lane key list', () => {
  it('always offers a verb that writes no fact', () => {
    const readers: SelectionAction<OutboundVerbRow>[] = [
      { key: 'copy', label: 'Copy', run: () => {} },
      { key: 'export', label: 'Export CSV', run: () => {} },
    ];
    assert.deepEqual(offeredSelectionActions(readers, []).map((a) => a.key), ['copy', 'export']);
  });

  it('offers a field-bound verb only where the fact is resolvable', () => {
    const verbs: SelectionAction<OutboundVerbRow>[] = [
      { key: 'condition', label: 'Set condition', writesField: 'orders.condition', run: () => {} },
      { key: 'scan-out', label: 'Scan out', writesField: 'orders.scanned_out', run: () => {} },
    ];
    assert.deepEqual(
      offeredSelectionActions(verbs, ['orders.condition']).map((a) => a.key),
      ['condition'],
    );
  });
});
