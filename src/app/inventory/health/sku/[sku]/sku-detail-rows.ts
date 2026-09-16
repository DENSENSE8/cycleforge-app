/**
 * Row mappers for the per-SKU operations view — this page's SQL shapes lifted
 * onto the shapes the REGISTERED families already speak.
 *
 * No section of this page owns a table. Two mount families that already
 * existed (`inventory-units`, `inventory-events`), one mounts the registered
 * `unit-allocations` family through a sibling layout document, and two are
 * families of their own (`sku-bins`, `sku-ledger`) whose entities nothing else
 * in the product lists. What every one of them needs is a translation, because
 * the loaders are narrower than the family feeds and `pg` hands back `Date`
 * objects where the resolvers read ISO strings:
 *
 * - {@link skuUnitsOverviewRows}: `serial_units` rows → {@link UnitsOverviewRow}.
 *   The page's query has no product join (every row on this page IS this SKU),
 *   so the sheet's structural Product track is filled from the page's own
 *   header facts rather than left blank.
 * - {@link skuPulseEventRows}: `inventory_events` rows → {@link PulseEventRow}.
 *   Facts this page does not fetch (bin move, notes, receiving refs) resolve to
 *   `null` and their tracks dash — this page never painted them and the mapper
 *   does not invent them.
 * - {@link skuBinTableRows}: `bin_contents` rows → {@link SkuBinTableRow}, with
 *   the same header-facts fill as the units sheet (the item cell is the SKU
 *   this page is about).
 * - {@link skuAllocationTableRows}: `order_unit_allocations` rows →
 *   {@link UnitAllocationTableRow}, the registered family's own wire row. The
 *   release facts are absent because this feed filters `state <> 'RELEASED'`;
 *   the type marks them optional for exactly this case.
 * - {@link skuLedgerTableRows}: `sku_stock_ledger` rows →
 *   {@link SkuLedgerTableRow}. `notes` stops HERE: it is selected by the
 *   loader and painted by nothing, and the boundary is where an unpainted fact
 *   is dropped rather than shipped to the client (the `toAuditLogRow`
 *   precedent).
 *
 * Pure: no React, no clock, no I/O.
 */

import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import type { PulseEventRow } from '@/components/inventory/types';
import type { SkuBinTableRow } from '@/lib/inventory/sku-bin-row';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';

/** `loadRecentUnits` row — the last 25 serial units for this SKU. */
export interface SkuRecentUnitRow {
  id: number;
  serial_number: string;
  current_status: string;
  current_location: string | null;
  condition_grade: string | null;
  updated_at: Date | string;
}

/** `loadEvents` row — the last 50 inventory events for this SKU. */
export interface SkuEventRow {
  id: number;
  occurred_at: Date | string;
  event_type: string;
  station: string | null;
  serial_unit_id: number | null;
  prev_status: string | null;
  next_status: string | null;
  actor_name: string | null;
}

/** `loadBins` row — every bin holding this SKU, densest first. */
export interface SkuBinLoaderRow {
  location_id: number;
  bin_name: string | null;
  bin_barcode: string | null;
  qty: number;
  min_qty: number | null;
  max_qty: number | null;
  last_counted: Date | string | null;
}

/** `loadAllocations` row — up to 50 OPEN holds on this SKU's units. */
export interface SkuAllocationLoaderRow {
  id: number;
  order_id: number;
  serial_unit_id: number;
  state: string;
  allocated_at: Date | string;
  allocated_by_name: string | null;
}

/** `loadLedger` row — the last 100 signed movements of this SKU. */
export interface SkuLedgerLoaderRow {
  id: number;
  created_at: Date | string;
  delta: number;
  reason: string;
  dimension: string;
  staff_id: number | null;
  staff_name: string | null;
  ref_serial_unit_id: number | null;
  ref_order_id: number | null;
  ref_receiving_line_id: number | null;
}

/** The SKU this page is about, plus its catalog title when there is one. */
export interface SkuIdentity {
  sku: string;
  productTitle: string | null;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function skuUnitsOverviewRows(
  rows: readonly SkuRecentUnitRow[],
  identity: SkuIdentity,
): UnitsOverviewRow[] {
  return rows.map((u) => ({
    id: u.id,
    serial_number: u.serial_number,
    product_title: identity.productTitle,
    sku: identity.sku,
    current_status: u.current_status,
    condition_grade: u.condition_grade,
    current_location: u.current_location,
    updated_at: isoOrNull(u.updated_at),
  }));
}

export function skuPulseEventRows(
  rows: readonly SkuEventRow[],
  identity: SkuIdentity,
): PulseEventRow[] {
  return rows.map((e) => ({
    id: e.id,
    // `PulseEventRow.occurred_at` is a required string; a row with no instant
    // cannot exist (the column is NOT NULL) so the empty string never appears
    // in practice, and the date resolver dashes it if it ever did.
    occurred_at: isoOrNull(e.occurred_at) ?? '',
    event_type: e.event_type,
    actor_staff_id: null,
    actor_name: e.actor_name,
    station: e.station,
    sku: identity.sku,
    product_title: identity.productTitle,
    serial_unit_id: e.serial_unit_id,
    // The page's query joins no serial: the unit column it painted was the
    // unit REFERENCE (`#123`), so that is what the serial track says.
    serial_number: e.serial_unit_id == null ? null : `#${e.serial_unit_id}`,
    bin_id: null,
    bin_name: null,
    prev_bin_id: null,
    prev_bin_name: null,
    prev_status: e.prev_status,
    next_status: e.next_status,
    notes: null,
    payload: {},
    receiving_id: null,
    receiving_line_id: null,
  }));
}

export function skuBinTableRows(
  rows: readonly SkuBinLoaderRow[],
  identity: SkuIdentity,
): SkuBinTableRow[] {
  return rows.map((b) => ({
    location_id: b.location_id,
    bin_name: b.bin_name,
    bin_barcode: b.bin_barcode,
    qty: Number(b.qty),
    // `pg` hands INTEGER back as a number, but a NULL bound must stay NULL:
    // `Number(null)` is 0, and "no floor configured" is not "a floor of zero".
    min_qty: b.min_qty == null ? null : Number(b.min_qty),
    max_qty: b.max_qty == null ? null : Number(b.max_qty),
    last_counted: isoOrNull(b.last_counted),
    sku: identity.sku,
    product_title: identity.productTitle,
  }));
}

export function skuAllocationTableRows(
  rows: readonly SkuAllocationLoaderRow[],
): UnitAllocationTableRow[] {
  return rows.map((a) => ({
    id: a.id,
    order_id: a.order_id,
    // `UnitAllocationTableRow.allocated_at` is a required string; a hold with
    // no stamp cannot exist (the column is NOT NULL) so the empty string never
    // appears in practice, and the date resolver dashes it if it ever did.
    allocated_at: isoOrNull(a.allocated_at) ?? '',
    state: a.state,
    serial_unit_id: a.serial_unit_id,
    allocated_by_name: a.allocated_by_name,
    // `released_at` / `released_reason` are deliberately ABSENT, not null: this
    // loader filters `a.state <> 'RELEASED'` and every writer stamps those two
    // columns in the same statement that sets the state, so they are
    // structurally NULL for every row here. The family's row type marks them
    // optional for exactly this feed.
  }));
}

export function skuLedgerTableRows(rows: readonly SkuLedgerLoaderRow[]): SkuLedgerTableRow[] {
  return rows.map((l) => ({
    id: l.id,
    created_at: isoOrNull(l.created_at) ?? '',
    delta: Number(l.delta),
    reason: l.reason,
    dimension: l.dimension,
    staff_id: l.staff_id,
    staff_name: l.staff_name,
    ref_order_id: l.ref_order_id,
    ref_receiving_line_id: l.ref_receiving_line_id,
    ref_serial_unit_id: l.ref_serial_unit_id,
    // `notes` stops here. The loader selects it, the retired table had no notes
    // column and no row expansion, and a fact nothing paints does not cross the
    // boundary (`toAuditLogRow` drops the audit diff payload the same way).
  }));
}
