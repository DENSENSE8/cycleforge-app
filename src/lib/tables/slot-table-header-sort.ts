/** Slot DataTable header-sort law — one chrome vocabulary, every PRODUCT_TABLES peer. */

const SLOT_TABLE_CHROME_TRACK_KEYS = [
  'select',
  'actions',
  'action',
  '_fill',
  // Photo gutter — a picture, not an ops fact to order by. Operator 2026-09-04.
  'thumb',
] as const;

type SlotTableChromeTrackKey = (typeof SLOT_TABLE_CHROME_TRACK_KEYS)[number];

const CHROME = new Set<string>(SLOT_TABLE_CHROME_TRACK_KEYS);

/** True when this header is structural chrome and must never offer click-to-sort. */
export function isSlotTableChromeTrack(key: string): boolean {
  return CHROME.has(key);
}
