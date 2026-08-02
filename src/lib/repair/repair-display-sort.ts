/**
 * URL-backed display-sort vocabulary for the repair queue — the twin of the
 * dashboard's `queue-display-sort` (Pending / Testing). A quiet trailing
 * dropdown in the workbench chrome plus click-to-sort grid headers share one
 * `?sort=` (+ optional `?dir=`) state.
 *
 * `newest` (created_at DESC, the server default) omits the param; column sorts
 * carry `?dir=` only when it differs from that column's default direction.
 */

import {
  defaultDirForRepairGridSort,
  isRepairGridSortable,
  type RepairGridColumnKey,
} from '@/lib/repair/repair-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Every sortable grid column (the frozen `select` gutter is never a sort). */
export type RepairDisplaySortColumn = Exclude<RepairGridColumnKey, 'select'>;
/** `newest` is the default composite (server `created_at DESC`). */
export type RepairDisplaySort = 'newest' | RepairDisplaySortColumn;
export type RepairDisplaySortDir = GridSortDir;

export function isRepairColumnSort(sort: string): sort is RepairDisplaySortColumn {
  return isRepairGridSortable(sort);
}

export const REPAIR_DISPLAY_SORT_OPTIONS: readonly {
  id: RepairDisplaySort;
  label: string;
  /** Short label for the chrome sort-dropdown trigger + rows. */
  shortLabel: string;
}[] = [
  { id: 'newest', label: 'Newest first', shortLabel: 'Newest' },
  { id: 'title', label: 'Product title', shortLabel: 'Product' },
  { id: 'date', label: 'Created date', shortLabel: 'Created' },
  { id: 'customer', label: 'Customer name', shortLabel: 'Customer' },
  { id: 'phone', label: 'Phone number', shortLabel: 'Phone' },
  { id: 'price', label: 'Price', shortLabel: 'Price' },
  { id: 'order', label: 'Order number', shortLabel: 'Order' },
  { id: 'ticket', label: 'Ticket number', shortLabel: 'Ticket' },
] as const;

/** Default direction when a sort is first activated (composites: null). */
export function defaultDirForRepairDisplaySort(sort: RepairDisplaySort): RepairDisplaySortDir | null {
  if (!isRepairColumnSort(sort)) return null;
  return defaultDirForRepairGridSort(sort);
}

export function parseRepairDisplaySort(raw: string | null | undefined): RepairDisplaySort {
  if (raw && isRepairColumnSort(raw)) return raw;
  return 'newest';
}

/**
 * Resolve `?dir=` for the active sort. Composites have no direction (null);
 * unknown / missing dir → the column's default direction.
 */
export function parseRepairDisplaySortDir(
  raw: string | null | undefined,
  sort: RepairDisplaySort,
): RepairDisplaySortDir | null {
  if (!isRepairColumnSort(sort)) return null;
  if (raw === 'asc' || raw === 'desc') return raw;
  return defaultDirForRepairGridSort(sort);
}

/** Write `?sort=` / `?dir=` — delete defaults so URLs stay clean. */
export function applyRepairDisplaySortParam(
  params: URLSearchParams,
  sort: RepairDisplaySort,
  dir?: RepairDisplaySortDir | null,
): void {
  if (sort === 'newest') params.delete('sort');
  else params.set('sort', sort);

  if (isRepairColumnSort(sort)) {
    const def = defaultDirForRepairGridSort(sort);
    const resolved = dir ?? def;
    if (resolved === def) params.delete('dir');
    else params.set('dir', resolved);
  } else {
    params.delete('dir');
  }
}

export function flipRepairDisplaySortDir(dir: RepairDisplaySortDir): RepairDisplaySortDir {
  return dir === 'asc' ? 'desc' : 'asc';
}
