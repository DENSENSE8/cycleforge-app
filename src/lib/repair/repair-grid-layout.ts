/**
 * Repair queue spreadsheet column model — SoT for the `/repair` LedgerGrid.
 *
 * Same spreadsheet family as Pending / Incoming, mapped to the repair-ticket
 * facts:
 *   select · title · customer · phone · price · order · ticket
 *
 * `title` carries the product title (with the issue as a quiet second line);
 * `order` is the source order id, showing WALK-IN when a ticket has none. The
 * frozen identity pane (select · title) + cell chrome reuse the shared grid
 * geometry from {@link ORDERS_QUEUE_COLUMNS}'s helpers — repair never grows a
 * second width system (mirrors Incoming's re-export block).
 */

import { gridFrozenKeys } from '@/design-system/components/grid/grid-column-editability';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { ColumnType } from '@/lib/tables/table-columns';
import { formatPhoneNumber } from '@/utils/phone';

export type RepairGridColumnKey =
  | 'select'
  | 'title'
  | 'date'
  | 'customer'
  | 'phone'
  | 'price'
  | 'order'
  | 'ticket';

export interface RepairGridColumn {
  key: RepairGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  /** Justification override — see {@link LedgerGridColumnModel.align}. */
  align?: 'start' | 'end';
  /** Part of the frozen identity pane — see {@link LedgerGridColumnModel.frozen}. */
  frozen?: boolean;
  /** Staff-preference key (`staff_preferences.tableColumns.repair`). */
  hideKey?: string;
  /** `core` ships ON (opt-out); `optional` ships OFF (opt-in via Fields). */
  tier?: 'core' | 'optional';
  /** When false, the header is not click-to-sort (select gutter only). */
  sortable?: boolean;
}

/**
 * Canonical repair columns, in strict scan order. Fact tracks are content-hard
 * `minmax(X,X)`; only `title` flexes. `order` shows WALK-IN when the ticket has
 * no linked source order.
 *
 * DEFAULT VIEW (tier `core`) is `select · title · date · customer · ticket` —
 * what came in, when, whose it is, and the RS-#### the desk quotes on the phone.
 * `phone` is contact detail (and PII) that only matters once you open the
 * ticket; `price` is a quote the detail pane owns; `order` reads "Walk-in" on
 * the overwhelming majority of rows, so as a default track it is a near-constant
 * column. All three ship `optional`.
 */
export const REPAIR_GRID_COLUMNS: readonly RepairGridColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', sortable: false, frozen: true },
  {
    key: 'title',
    frozen: true,
    width: 'minmax(12rem, 1fr)',
    label: 'Product',
    type: 'text',
    labelFitRem: 8,
  },
  // Civil day the repair service was created (newest-first default). Wide
  // enough to show the full "Created" header label (not truncated "Crea…").
  { key: 'date', width: 'minmax(6rem, 6rem)', label: 'Created', type: 'date', hideKey: 'date', labelFitRem: 4.5 },
  { key: 'customer', width: 'minmax(7rem, 7rem)', label: 'Customer', type: 'text', hideKey: 'customer', labelFitRem: 4.5 },
  { key: 'phone', width: 'minmax(6.5rem, 6.5rem)', label: 'Phone', type: 'text', hideKey: 'phone', tier: 'optional', labelFitRem: 4.5 },
  { key: 'price', width: 'minmax(4.5rem, 4.5rem)', label: 'Price', type: 'number', hideKey: 'price', tier: 'optional', labelFitRem: 4.5 },
  // Walk-in vs linked source order — WALK-IN label needs the wider track.
  { key: 'order', width: 'minmax(5.5rem, 5.5rem)', label: 'Walk-in / Order', gridLabel: 'Order', type: 'id', hideKey: 'order', tier: 'optional', labelFitRem: 4.5 },
  { key: 'ticket', width: 'minmax(5rem, 5rem)', label: 'Ticket', type: 'id', hideKey: 'ticket', labelFitRem: 4.5 },
] as const;

/**
 * Frozen identity pane — `select · title`. Derived from the column model's
 * `frozen` flag (one declaration for freeze + immovability + offset math), not
 * from the house key list: the pane is a per-surface answer, and Orders already
 * freezes a third track. See `grid-column-editability.ts`.
 */
const REPAIR_GRID_LOCKED_KEYS: readonly RepairGridColumnKey[] = gridFrozenKeys(REPAIR_GRID_COLUMNS);

/** Data columns that support click-to-sort (excludes the select gutter). */
const REPAIR_GRID_SORTABLE_KEYS: readonly RepairGridColumnKey[] = REPAIR_GRID_COLUMNS.filter(
  (c) => c.sortable !== false && c.key !== 'select',
).map((c) => c.key);

export function isRepairGridSortable(key: string): key is RepairGridColumnKey {
  return (REPAIR_GRID_SORTABLE_KEYS as readonly string[]).includes(key);
}


export function repairGridTemplate(
  columns: readonly RepairGridColumn[] = REPAIR_GRID_COLUMNS,
): string {
  return gridTemplate(columns);
}

export function isRepairGridFrozen(key: string): boolean {
  return REPAIR_GRID_LOCKED_KEYS.includes(key as RepairGridColumnKey);
}

export type RepairGridSortDir = 'asc' | 'desc';

/** Default direction when a column sort is first activated. */
export function defaultDirForRepairGridSort(key: RepairGridColumnKey): RepairGridSortDir {
  // Created date scans newest-first by default; everything else A→Z / low→high.
  return key === 'date' ? 'desc' : 'asc';
}

/* ── Field-source helpers (display ↔ sort SoT) ─────────────────────────────
 * The row cells and the comparators both read these so a column always sorts
 * by exactly what it shows. contact_info is the legacy free-text fallback:
 * "Name, Phone, Email" comma-segments when the normalized customer_* columns
 * are empty. */

function contactSegment(contactInfo: string | null | undefined, index: number): string {
  if (!contactInfo) return '';
  const parts = contactInfo.split(',').map((p) => p.trim());
  return parts[index] || '';
}

/** Customer name — normalized column, else the first contact_info segment. */
export function repairCustomerName(repair: RSRecord): string {
  return (repair.customer_name || '').trim() || contactSegment(repair.contact_info, 0);
}

/** Raw customer phone — normalized column, else the second contact_info segment. */
export function repairCustomerPhone(repair: RSRecord): string {
  return (repair.customer_phone || '').trim() || contactSegment(repair.contact_info, 1);
}

/** Formatted phone for display (000-000-0000). */
export function repairPhoneDisplay(repair: RSRecord): string {
  return formatPhoneNumber(repairCustomerPhone(repair));
}

/** Linked source order id (empty = walk-in). */
export function repairOrderValue(repair: RSRecord): string {
  return String(repair.source_order_id || '').trim();
}

/** Ticket number (RS-#### fallback lives server-side on create). */
export function repairTicketValue(repair: RSRecord): string {
  return String(repair.ticket_number || '').trim();
}

/** Created-at instant for the Date column / sort (empty → null). */
export function repairCreatedAtSource(repair: RSRecord): string | null {
  return (repair.created_at || '').trim() || null;
}

/**
 * Price display — the free-text `price` string prefixed with `$` (unless it
 * already carries one). Empty → null so the cell renders the em-dash.
 */
export function repairPriceDisplay(repair: RSRecord): string | null {
  const raw = String(repair.price || '').trim();
  if (!raw) return null;
  return raw.startsWith('$') ? raw : `$${raw}`;
}

/** Numeric price for sorting (parsed from the free-text value; 0 when absent). */
export function repairPriceSortValue(repair: RSRecord): number {
  const cleaned = String(repair.price || '').replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Shared spreadsheet chrome — same helpers as outbound OrdersGridView / Incoming.
export {
  ORDERS_QUEUE_FROZEN_CELL as REPAIR_GRID_FROZEN_CELL,
  ordersQueueFrozenLeft as repairGridFrozenLeft,
  ordersQueueGridCell as repairGridCell,
  ordersQueueRowShellClass as repairGridRowShellClass,
} from '@/lib/dashboard-order-row-layout';
