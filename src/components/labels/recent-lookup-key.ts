import type { LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';

/**
 * Lookup key for a feed row, resolvable by GET /api/serial-units/[id] (which
 * accepts a numeric id, a serial_number, OR a minted unit_uid). Prefer the
 * numeric id, then serial, then the minted `unit_id` — the last is what's
 * always present for label prints whose tech_serial_numbers cross-ref is null.
 */
export function recentLookupKey(item: LabelPrintFeedItem): string {
  if (item.serial_unit_id != null) return String(item.serial_unit_id);
  return item.serial_number || item.unit_id || '';
}
