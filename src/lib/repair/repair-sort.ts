/**
 * The repair list's Sort (owner 2026-09-29) — the contextual sidebar's
 * `sort` control on `/repair` and Sales › Repair service, the route specs'
 * `?sort=` and `RepairCardList`'s default order. Browser- and server-safe.
 */

export const REPAIR_SORT_PARAM = 'sort';

/** The list's orders in the sidebar's words; each value carries its direction. */
export const REPAIR_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'status', label: 'Status' },
  { value: 'ticket', label: 'Ticket number' },
  { value: 'customer', label: 'Customer, A to Z' },
  { value: 'product', label: 'Product, A to Z' },
  { value: 'price_high', label: 'Highest price first' },
] as const;

export type RepairSort = (typeof REPAIR_SORT_OPTIONS)[number]['value'];

/** The order with `?sort=` unset (the sidebar drops it from the URL). */
export const DEFAULT_REPAIR_SORT: RepairSort = 'newest';

export function parseRepairSort(raw: string | null | undefined): RepairSort | null {
  return REPAIR_SORT_OPTIONS.some((option) => option.value === raw) ? (raw as RepairSort) : null;
}
