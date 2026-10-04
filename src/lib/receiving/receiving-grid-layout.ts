/** Receiving-line sort vocabulary — the fact words Unbox, Docked, Unboxed and Incoming sort by (`?colsort=`). */

import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import {
  isCustomFieldColumnKey,
  type CustomFieldColumnKey,
} from '@/lib/tables/custom-field-keys';

export type ReceivingGridColumnKey =
  | 'select'
  | 'title'
  | 'status'
  | 'date'
  | 'qty'
  | 'price'
  | 'condition'
  | 'location'
  | 'order'
  | 'tracking'
  | 'serial'
  | 'zoho'
  /** Legacy two-row track names a saved `?colsort=` may still carry — sort as their fact word. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'dates'
  | 'state'
  | 'actions'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`
  /** Org-defined custom columns (`custom:<defKey>`). */
  | CustomFieldColumnKey;

/** The fact words this family sorts by — declared, not derived. */
const RECEIVING_GRID_SORTABLE_KEYS: readonly ReceivingGridColumnKey[] = [
  'order',
  'title',
  'status',
  'date',
  'qty',
  'price',
  'condition',
  'location',
  'tracking',
  'serial',
  'zoho',
];

/** The comparator shape each fact sorts under. */
export const RECEIVING_SORT_FACT_TYPES: Readonly<
  Partial<Record<ReceivingGridColumnKey, LedgerGridColumnModel['type']>>
> = {
  order: 'id',
  title: 'text',
  status: 'tag',
  date: 'date',
  qty: 'number',
  price: 'price',
  condition: 'tag',
  location: 'location',
  tracking: 'tracking',
  serial: 'id',
  zoho: 'tag',
};

/** Click-to-sort predicate — the ONE sortability answer for this family. */
/** Compound track → the FLAT fact word it carries. */
const RECEIVING_TRACK_SORT_FACTS: Readonly<Record<string, ReceivingGridColumnKey>> = {
  dates: 'date',
  fulfillment: 'order',
  item: 'title',
  amount: 'price',
  state: 'status',
};

/** Normalize a header key to the fact word this family sorts by. */
export function receivingSortFactFor(key: string): ReceivingGridColumnKey | null {
  if (isCustomFieldColumnKey(key)) return key as ReceivingGridColumnKey;
  const track = RECEIVING_TRACK_SORT_FACTS[key];
  if (track) return track;
  return (RECEIVING_GRID_SORTABLE_KEYS as readonly string[]).includes(key)
    ? (key as ReceivingGridColumnKey)
    : null;
}

export function isReceivingGridSortable(key: string): key is ReceivingGridColumnKey {
  return receivingSortFactFor(key) != null;
}

/** Default direction when first activating a column sort. */
export function defaultDirForReceivingGridSort(key: ReceivingGridColumnKey): GridSortDir {
  // Date: most recent first (ops scan). Price / qty: highest first.
  if (key === 'date' || key === 'price' || key === 'qty') return 'desc';
  return 'asc';
}

// (flipReceivingGridSortDir retired — the TanStack sort surface owns the
//  asc ↔ desc cycle via LedgerGridSurface / useGridSurface.)

// --------------------------------------------------------------------------- Incoming POS — sort vocabulary only.

export type IncomingGridColumnKey =
  | 'select'
  | 'title'
  | 'date'
  | 'age'
  | 'qty'
  | 'condition'
  | 'status'
  | 'platform'
  | 'order'
  | 'tracking'
  | 'zoho'
  /** Compound (two-row) presentation tracks the ledger header may name. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'dates'
  | 'state'
  | 'actions'
  | '_fill'
  /** Materialized slot tracks — keys are slot indices, never field ids. */
  | `status:${number}`
  | `subtitle:${number}`;

/**
 * The fact words this family sorts by — declared, not derived (see
 * {@link receivingSortFactFor} for why a vocabulary is not a layout).
 */
const INCOMING_GRID_SORTABLE_KEYS: readonly IncomingGridColumnKey[] = [
  'order',
  'title',
  'date',
  'age',
  'qty',
  'condition',
  'status',
  'platform',
  'tracking',
  'zoho',
];

/** Compound track → the FLAT fact word it carries — Receiving's twin, same reason (see {@link receivingSortFactFor}). */
const INCOMING_TRACK_SORT_FACTS: Readonly<Record<string, IncomingGridColumnKey>> = {
  dates: 'date',
  fulfillment: 'order',
  item: 'title',
  state: 'status',
};

/** Normalize a header key to the fact word this family sorts by. */
export function incomingSortFactFor(key: string): IncomingGridColumnKey | null {
  const track = INCOMING_TRACK_SORT_FACTS[key];
  if (track) return track;
  return (INCOMING_GRID_SORTABLE_KEYS as readonly string[]).includes(key)
    ? (key as IncomingGridColumnKey)
    : null;
}

export function isIncomingGridSortable(key: string): key is IncomingGridColumnKey {
  return incomingSortFactFor(key) != null;
}

/** Default direction when first activating a column sort. */
export function defaultDirForIncomingGridSort(key: IncomingGridColumnKey): GridSortDir {
  // Age: most overdue / oldest first (urgency scan), matching Pending.
  if (key === 'age') return 'desc';
  return 'asc';
}

/** Civil date source for the Date column (expected → PO → created). */
export function incomingRowDateSource(row: {
  expected_delivery_date?: string | null;
  po_date?: string | null;
  created_at?: string | null;
}): string | null {
  return (
    (row.expected_delivery_date || '').trim() ||
    (row.po_date || '').trim() ||
    (row.created_at || '').trim() ||
    null
  );
}
