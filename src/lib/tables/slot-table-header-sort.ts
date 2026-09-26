/**
 * Slot DataTable header-sort law — one chrome vocabulary, every PRODUCT_TABLES peer.
 *
 * A painted DATA track is click-to-sort. Headers that stay inert are
 * structural chrome (`select`, overflow `actions`/`action`, trailing `_fill`,
 * and `thumb` — the Image photo gutter). Freeze ≠ unsortable for facts.
 * The Image column still paints (glyph header on every PRODUCT_TABLES peer);
 * it does not offer click-to-sort. The toolbar sort dropdown lists DATA facts
 * (`queueColumnSortOptions`) so Pick / Status are selectable rows.
 *
 * Graph KEEP: `engine:slot-table-header-sort` + `engine:queueSortForColumnKey`.
 */

export const SLOT_TABLE_CHROME_TRACK_KEYS = [
  'select',
  'actions',
  'action',
  '_fill',
  // Photo gutter — a picture, not an ops fact to order by. Operator 2026-09-04.
  'thumb',
] as const;

export type SlotTableChromeTrackKey = (typeof SLOT_TABLE_CHROME_TRACK_KEYS)[number];

const CHROME = new Set<string>(SLOT_TABLE_CHROME_TRACK_KEYS);

/** True when this header is structural chrome and must never offer click-to-sort. */
export function isSlotTableChromeTrack(key: string): boolean {
  return CHROME.has(key);
}
