/**
 * The per-SKU page's row mappers, against the families they feed: what each
 * ported section paints has to come out of the REGISTERED resolvers, not out of
 * a second column list.
 *
 * The mappers are the page's only hand-written display code, and they carry two
 * contracts a type cannot state: `pg` hands back `Date` objects where every
 * resolver reads an ISO STRING (a `Date` that slipped through crashes the first
 * `.slice`), and a column the loader selects but nothing paints must STOP at
 * this boundary rather than crossing into the client bundle.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  skuAllocationTableRows,
  skuBinTableRows,
  skuLedgerTableRows,
  skuPulseEventRows,
  skuUnitsOverviewRows,
  type SkuAllocationLoaderRow,
  type SkuBinLoaderRow,
  type SkuEventRow,
  type SkuLedgerLoaderRow,
  type SkuRecentUnitRow,
} from './sku-detail-rows';
import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { resolveUnitsSlotValue } from '@/lib/tables/field-catalog/units-resolve';
import { resolveInventoryEventsSlotValue } from '@/lib/tables/field-catalog/inventory-events-resolve';
import { resolveSkuBinsSlotValue } from '@/lib/tables/field-catalog/sku-bins-resolve';
import { resolveSkuLedgerSlotValue } from '@/lib/tables/field-catalog/sku-ledger-resolve';
import { resolveUnitAllocationsSlotValue } from '@/lib/tables/field-catalog/unit-allocations-resolve';

const IDENTITY = { sku: 'BOSE-WAVE-III', productTitle: 'Bose Wave Music System III' };

/** The display text of a resolved fact, narrowed — never an inline cast. */
function text(value: CompoundSlotValue | null): string | null {
  if (!value || value.kind !== 'value') return null;
  return value.text;
}

function unitRow(overrides: Partial<SkuRecentUnitRow> = {}): SkuRecentUnitRow {
  return {
    id: 41,
    serial_number: '9M52B2C4',
    current_status: 'TESTED',
    current_location: 'BIN A-12',
    condition_grade: 'B',
    updated_at: new Date('2026-08-19T15:04:05.000Z'),
    ...overrides,
  };
}

function eventRow(overrides: Partial<SkuEventRow> = {}): SkuEventRow {
  return {
    id: 907,
    occurred_at: new Date('2026-08-19T15:04:05.000Z'),
    event_type: 'UNIT_STATUS_CHANGE',
    station: 'TECH-2',
    serial_unit_id: 41,
    prev_status: 'RECEIVED',
    next_status: 'TESTED',
    actor_name: 'Pack Tuan',
    ...overrides,
  };
}

describe('skuUnitsOverviewRows', () => {
  it('every fact the page painted resolves through the units family', () => {
    const [row] = skuUnitsOverviewRows([unitRow()], IDENTITY);

    assert.equal(text(resolveUnitsSlotValue(row, 'units.serial')), '9M52B2C4');
    assert.equal(text(resolveUnitsSlotValue(row, 'units.status')), 'TESTED');
    assert.equal(text(resolveUnitsSlotValue(row, 'units.location')), 'BIN A-12');
    assert.ok(text(resolveUnitsSlotValue(row, 'units.condition')));
    // The resolver slices an ISO day off the string, so a pg `Date` has to
    // arrive converted — a Date object would blow up on `.slice`.
    assert.ok(text(resolveUnitsSlotValue(row, 'units.updated')));
  });

  it('fills the sheet Product track from the page identity', () => {
    const [row] = skuUnitsOverviewRows([unitRow()], IDENTITY);
    assert.equal(row.sku, 'BOSE-WAVE-III');
    assert.equal(row.product_title, 'Bose Wave Music System III');
  });

  it('a SKU with no catalog row still maps — the title is absent, not invented', () => {
    const [row] = skuUnitsOverviewRows([unitRow()], { sku: 'NO-CAT', productTitle: null });
    assert.equal(row.product_title, null);
  });
});

describe('skuPulseEventRows', () => {
  it('every fact the page painted resolves through the events family', () => {
    const [row] = skuPulseEventRows([eventRow()], IDENTITY);

    assert.ok(text(resolveInventoryEventsSlotValue(row, 'inventory-events.occurred')));
    assert.equal(
      text(resolveInventoryEventsSlotValue(row, 'inventory-events.event_type')),
      'UNIT_STATUS_CHANGE',
    );
    assert.equal(text(resolveInventoryEventsSlotValue(row, 'inventory-events.actor')), 'Pack Tuan');
    // The transition is ONE fact in the catalog — the two badges the page drew.
    assert.equal(
      text(resolveInventoryEventsSlotValue(row, 'inventory-events.status_change')),
      'RECEIVED → TESTED',
    );
  });

  it('the unit reference the page painted lands on the serial track', () => {
    const [row] = skuPulseEventRows([eventRow()], IDENTITY);
    assert.equal(text(resolveInventoryEventsSlotValue(row, 'inventory-events.serial')), '#41');
  });

  it('an event with no unit has no serial — never "#null"', () => {
    const [row] = skuPulseEventRows([eventRow({ serial_unit_id: null })], IDENTITY);
    assert.equal(row.serial_number, null);
    assert.equal(text(resolveInventoryEventsSlotValue(row, 'inventory-events.serial')), null);
  });

  it('facts this page does not fetch are null, not fabricated', () => {
    const [row] = skuPulseEventRows([eventRow()], IDENTITY);
    assert.equal(text(resolveInventoryEventsSlotValue(row, 'inventory-events.bin')), null);
    assert.equal(text(resolveInventoryEventsSlotValue(row, 'inventory-events.notes')), null);
    assert.equal(row.receiving_id, null);
    assert.deepEqual(row.payload, {});
  });

  it('the identity fact is the page SKU — the thing every row happened to', () => {
    const [row] = skuPulseEventRows([eventRow()], IDENTITY);
    assert.equal(
      text(resolveInventoryEventsSlotValue(row, 'inventory-events.sku')),
      'BOSE-WAVE-III · Bose Wave Music System III',
    );
  });

  it('an unknown field id is still null through the mapped row', () => {
    const [row] = skuPulseEventRows([eventRow()], IDENTITY);
    assert.equal(resolveInventoryEventsSlotValue(row, 'inventory-events.ghost'), null);
  });
});

function binRow(overrides: Partial<SkuBinLoaderRow> = {}): SkuBinLoaderRow {
  return {
    location_id: 4120,
    bin_name: 'A · R2 · C4',
    bin_barcode: 'BIN-A-R2-C4',
    qty: 12,
    min_qty: 4,
    max_qty: 40,
    last_counted: new Date('2026-08-19T15:04:05.000Z'),
    ...overrides,
  };
}

function allocationRow(overrides: Partial<SkuAllocationLoaderRow> = {}): SkuAllocationLoaderRow {
  return {
    id: 77,
    order_id: 48123,
    serial_unit_id: 41,
    state: 'ALLOCATED',
    allocated_at: new Date('2026-08-19T15:04:05.000Z'),
    allocated_by_name: 'Pack Tuan',
    ...overrides,
  };
}

function ledgerRow(overrides: Partial<SkuLedgerLoaderRow> = {}): SkuLedgerLoaderRow {
  return {
    id: 55120,
    created_at: new Date('2026-08-19T15:04:05.000Z'),
    delta: -3,
    reason: 'SALE',
    dimension: 'WAREHOUSE',
    staff_id: 17,
    staff_name: 'Pack Tuan',
    ref_serial_unit_id: 41,
    ref_order_id: 48123,
    ref_receiving_line_id: 902,
    notes: null,
    ...overrides,
  };
}

describe('skuBinTableRows', () => {
  it('every fact the page painted resolves through the bins family', () => {
    const [row] = skuBinTableRows([binRow()], IDENTITY);

    assert.equal(text(resolveSkuBinsSlotValue(row, 'sku-bins.bin')), 'A · R2 · C4');
    assert.equal(text(resolveSkuBinsSlotValue(row, 'sku-bins.qty')), '12');
    assert.equal(text(resolveSkuBinsSlotValue(row, 'sku-bins.min_qty')), '4');
    assert.equal(text(resolveSkuBinsSlotValue(row, 'sku-bins.max_qty')), '40');
    // The pg `Date` has to arrive as an ISO string, or the date cell's face
    // and the sort comparator read an object.
    assert.equal(
      text(resolveSkuBinsSlotValue(row, 'sku-bins.last_counted')),
      '2026-08-19T15:04:05.000Z',
    );
  });

  it('fills the structural item cell from the page identity', () => {
    const [row] = skuBinTableRows([binRow()], IDENTITY);
    assert.equal(
      text(resolveSkuBinsSlotValue(row, 'sku-bins.item')),
      'Bose Wave Music System III',
    );
    // …and a SKU with no catalog row names itself rather than inventing a title.
    const [bare] = skuBinTableRows([binRow()], { sku: 'NO-CAT', productTitle: null });
    assert.equal(text(resolveSkuBinsSlotValue(bare, 'sku-bins.item')), 'NO-CAT');
  });

  it('keeps an unset bound NULL — `Number(null)` would invent a floor of zero', () => {
    const [row] = skuBinTableRows([binRow({ min_qty: null, max_qty: null })], IDENTITY);
    assert.equal(row.min_qty, null);
    assert.equal(row.max_qty, null);
    assert.equal(text(resolveSkuBinsSlotValue(row, 'sku-bins.min_qty')), null);
    // A pair with no bounds is not in breach of one.
    assert.equal(text(resolveSkuBinsSlotValue(row, 'sku-bins.level')), 'Stocked');
  });
});

describe('skuAllocationTableRows', () => {
  it('every fact the page painted resolves through the allocations family', () => {
    const [row] = skuAllocationTableRows([allocationRow()]);

    assert.equal(text(resolveUnitAllocationsSlotValue(row, 'unit-allocations.order')), '48123');
    assert.equal(text(resolveUnitAllocationsSlotValue(row, 'unit-allocations.unit')), '41');
    assert.equal(text(resolveUnitAllocationsSlotValue(row, 'unit-allocations.state')), 'ALLOCATED');
    assert.equal(
      text(resolveUnitAllocationsSlotValue(row, 'unit-allocations.allocated')),
      '2026-08-19T15:04:05.000Z',
    );
    assert.equal(
      text(resolveUnitAllocationsSlotValue(row, 'unit-allocations.allocated_by')),
      'Pack Tuan',
    );
  });

  it('carries no release facts — this feed filters released holds out', () => {
    const [row] = skuAllocationTableRows([allocationRow()]);
    assert.ok(!('released_at' in row), 'a structurally NULL column crossed the boundary');
    assert.ok(!('released_reason' in row));
    // The family resolves them anyway, to null, and the track dashes.
    assert.equal(text(resolveUnitAllocationsSlotValue(row, 'unit-allocations.released')), null);
    assert.equal(text(resolveUnitAllocationsSlotValue(row, 'unit-allocations.reason')), null);
  });
});

describe('skuLedgerTableRows', () => {
  it('every fact the page painted resolves through the ledger family', () => {
    const [row] = skuLedgerTableRows([ledgerRow()]);

    assert.equal(text(resolveSkuLedgerSlotValue(row, 'sku-ledger.when')), '2026-08-19T15:04:05.000Z');
    assert.equal(text(resolveSkuLedgerSlotValue(row, 'sku-ledger.delta')), '-3');
    assert.equal(text(resolveSkuLedgerSlotValue(row, 'sku-ledger.reason')), 'SALE');
    assert.equal(text(resolveSkuLedgerSlotValue(row, 'sku-ledger.dimension')), 'WAREHOUSE');
    // The retired Refs cell's three thirds, each on its own now.
    assert.equal(text(resolveSkuLedgerSlotValue(row, 'sku-ledger.ref_order')), '48123');
    assert.equal(text(resolveSkuLedgerSlotValue(row, 'sku-ledger.ref_serial_unit')), '41');
    assert.equal(text(resolveSkuLedgerSlotValue(row, 'sku-ledger.ref_receiving_line')), '902');
  });

  it('carries `notes` trimmed, and a blank note as null', () => {
    const [custom] = skuLedgerTableRows([
      ledgerRow({ reason: 'TAKE_CUSTOM', notes: '  Returned to vendor ' }),
    ]);
    assert.equal(text(resolveSkuLedgerSlotValue(custom, 'sku-ledger.notes')), 'Returned to vendor');
    const [blank] = skuLedgerTableRows([ledgerRow({ notes: '   ' })]);
    assert.equal(blank.notes, null);
  });

  it('keeps the staff id, so the actor paints as a person rather than "system"', () => {
    const [named] = skuLedgerTableRows([ledgerRow()]);
    assert.deepEqual(resolveSkuLedgerSlotValue(named, 'sku-ledger.staff'), {
      kind: 'person',
      staffId: 17,
      name: 'Pack Tuan',
    });
    const [machine] = skuLedgerTableRows([ledgerRow({ staff_id: null, staff_name: null })]);
    assert.deepEqual(resolveSkuLedgerSlotValue(machine, 'sku-ledger.staff'), {
      kind: 'person',
      staffId: null,
      name: null,
    });
  });
});
