/**
 * Bins field catalog — the bindable warehouse-bin facts, as DATA. Wave 1.4's
 * second family (`docs/todo/seller-table-program-PLAN.md` §03;
 * `docs/kill-list/07-slot-table-hand-models.md` — the `bins` row:
 * "location/occupancy facts. Same skeleton as every other browse table.").
 *
 * Every entry names a fact `BinsOverviewRow` already carries. Resolution is
 * `./bins-resolve.ts`, kept separate so this module stays a LEAF.
 *
 * Bins is a SHEET morph. `bins.barcode` is the IDENTITY fact — the bin's own
 * scannable handle, which the structural frozen Barcode track paints.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const BINS_FIELD_CATALOG: FieldCatalog = [
  {
    id: 'bins.barcode',
    family: 'bins',
    label: 'Barcode',
    displayType: 'id',
    slotKinds: ['identity'],
    paths: { value: 'barcode' },
  },
  {
    id: 'bins.location',
    family: 'bins',
    label: 'Room / Location',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { room: 'room', zone: 'zone_letter', row: 'row_label', col: 'col_label' },
  },
  {
    id: 'bins.sku_count',
    family: 'bins',
    label: 'SKUs',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'sku_count' },
  },
  {
    id: 'bins.total_qty',
    family: 'bins',
    label: 'Qty',
    displayType: 'number',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'total_qty' },
  },
  // A bar plus a percentage — the cell owns the bar; the resolved TEXT is the
  // percentage, which is what a bound column or an export can carry.
  {
    id: 'bins.fill',
    family: 'bins',
    label: 'Fill',
    displayType: 'text',
    slotKinds: ['status', 'subtitle'],
    paths: { pct: 'fill_pct', current: 'total_qty', max: 'capacity' },
  },
  {
    id: 'bins.last_counted',
    family: 'bins',
    label: 'Counted',
    displayType: 'date',
    slotKinds: ['status', 'subtitle'],
    paths: { value: 'last_counted' },
  },
  // A COMPOSITE of four independent flags, so it never sorts — that rule lives
  // on the fact (see `binsSortFactFor`), not on a track key, and a rebind
  // carries it.
  {
    id: 'bins.status',
    family: 'bins',
    label: 'Status',
    displayType: 'tag',
    slotKinds: ['status', 'subtitle'],
    paths: {
      empty: 'is_empty',
      low: 'has_low_stock',
      over: 'is_over_capacity',
      stale: 'is_stale',
    },
  },
];

/**
 * The PRODUCT default bins layout — visual parity with the retired hand model
 * (`select · barcode · location · SKUs · qty · fill · counted · status`): every
 * track answers a question the warehouse operator asks while scanning the floor
 * map — which bin, where, how full, when last counted, what flags. The whole
 * set shipped ON, so the whole set is bound.
 * Guard: `bins.test.ts` parses this against the catalog.
 */
export const BINS_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'sheet',
  identityFieldId: 'bins.barcode',
  statusBindings: [
    { fieldId: 'bins.location' },
    { fieldId: 'bins.sku_count' },
    { fieldId: 'bins.total_qty' },
    { fieldId: 'bins.fill' },
    { fieldId: 'bins.last_counted' },
    { fieldId: 'bins.status' },
  ],
  subtitleBindings: [],
  amountFieldId: null,
};

/** The one tableId this catalog serves — `PRODUCT_TABLES`' Warehouse bins entry. */
export const BINS_TABLE_LAYOUT_ID = 'bins';
