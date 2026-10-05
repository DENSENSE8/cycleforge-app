/**
 * The Inventory lane's sidebar `choices` vocabularies (server-safe: the nav
 * registry imports them). Each omits the list's default — absent = default,
 * re-tap clears — so a row never offers the state the list is already in.
 */

/** Legacy Locations tool choices. The current navigation uses explicit destinations; absent = All. */
export const LOCATIONS_TAB_OPTIONS = [
  { value: 'rooms', label: 'Rooms' },
  { value: 'map', label: 'Map' },
  // Movable racks (`RK12`). The wire id is `movable`: `racks` is the legacy bay alias.
  { value: 'movable', label: 'Racks' },
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
