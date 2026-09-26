import type { LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';

/** Lookup key for a feed row, resolvable by GET /api/serial-units/[id] (which accepts a numeric id, a serial_number, OR a minted unit_uid). */
export function recentLookupKey(item: LabelPrintFeedItem): string {
  if (item.serial_unit_id != null) return String(item.serial_unit_id);
  return item.serial_number || item.unit_id || '';
}
