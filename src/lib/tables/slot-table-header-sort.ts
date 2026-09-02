/**
 * Slot DataTable header-sort law — one chrome vocabulary, every PRODUCT_TABLES peer.
 *
 * A painted DATA track is click-to-sort. The only headers that stay inert are
 * structural chrome (`select`, overflow `actions`/`action`, trailing `_fill`).
 * Image/`thumb` is DATA (a photo fact), not chrome — freeze ≠ unsortable.
 * The toolbar sort dropdown must list those same facts (`queueColumnSortOptions`)
 * so Pick / Status / Image are selectable rows, not only a trigger label.
 *
 * Eval: `SLOT_TABLE_PAINT_LAW.headerSort` + tripwire in `slot-table-cohort.test.ts`.
 * Graph KEEP: `engine:slot-table-header-sort` + `engine:queueSortForColumnKey`.
 */

export const SLOT_TABLE_CHROME_TRACK_KEYS = [
  'select',
  'actions',
  'action',
  '_fill',
] as const;

export type SlotTableChromeTrackKey = (typeof SLOT_TABLE_CHROME_TRACK_KEYS)[number];

const CHROME = new Set<string>(SLOT_TABLE_CHROME_TRACK_KEYS);

/** True when this header is structural chrome and must never offer click-to-sort. */
export function isSlotTableChromeTrack(key: string): boolean {
  return CHROME.has(key);
}
