/**
 * The Inventory lane's sidebar `choices` vocabularies (server-safe: the nav
 * registry imports them). Each omits the list's default — absent = default,
 * re-tap clears — so a row never offers the state the list is already in.
 */

import { LOCATION_BAY_LABEL_PLURAL } from '@/lib/barcode-routing';

/** Stock `?status=` — absent = all stock. `on-hold` is also the SKU Exceptions view. */
export const STOCK_STATE_OPTIONS = [
  { value: 'catalog', label: 'Catalog paired' },
  { value: 'on-hold', label: 'On hold' },
] as const;

/** Locations `?tab=` — absent = Bin Tags. `bins` is reached from Map, not offered. */
export const LOCATIONS_TAB_OPTIONS = [
  { value: 'bays', label: LOCATION_BAY_LABEL_PLURAL },
  { value: 'totes', label: 'Totes' },
  { value: 'rooms', label: 'Rooms' },
  { value: 'map', label: 'Map' },
  { value: 'manage', label: 'Manage' },
] as const;

/** Replenish `?rtab=` — two lists, so both are named (a one-option choice cannot render); absent = Need to order. */
export const REPLENISH_TAB_OPTIONS = [
  { value: 'fifo', label: 'Shipped FIFO' },
  { value: 'need', label: 'Need to order' },
] as const;

/** Replenish `?rstatus=` — absent = every active request. */
export const REPLENISH_STATUS_OPTIONS = [
  { value: 'detected', label: 'Detected' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'planned_for_po', label: 'Planned for PO' },
  { value: 'po_created', label: 'PO created' },
  { value: 'waiting_for_receipt', label: 'Waiting for receipt' },
] as const;
