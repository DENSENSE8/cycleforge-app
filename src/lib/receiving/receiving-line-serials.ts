import { getLast8 } from '@/lib/copy-chip-format';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/** Optimistic / unmatched return lines stamp identity into `item_name`. */
const RETURN_SERIAL_TITLE_RE = /^Return serial\s+(\S+)\s*$/i;

/**
 * Extract the scanned serial from a generated `Return serial …` product title.
 * Returns null when the title is not that generated face.
 */
export function parseReturnSerialTitle(
  itemName: string | null | undefined,
): string | null {
  const serial = String(itemName || '').match(RETURN_SERIAL_TITLE_RE)?.[1];
  return serial?.trim() || null;
}

/**
 * Operator face for a generated return-serial title — last-8 serial (chip SoT).
 *
 * Prefer {@link liveSerial} (persisted / projected unit) over the serial baked
 * into `item_name` — edits and rescans update serial units first and can leave
 * a stale `Return serial …` title until linkage renames the product.
 */
export function formatReturnSerialProductTitle(
  itemName: string,
  liveSerial?: string | null,
): string {
  if (parseReturnSerialTitle(itemName) == null) return itemName;
  const serial = String(liveSerial || '').trim() || parseReturnSerialTitle(itemName);
  if (!serial) return itemName;
  return `Return serial ${getLast8(serial)}`;
}

/**
 * Resolve the serial-column value for a receiving line.
 *
 * Persisted serial units are authoritative. Legacy/optimistic return lines can
 * instead carry the scanned identity in their generated `Return serial …`
 * title, so retain that exact fallback until their serial projection catches up.
 */
export function resolveReceivingLineSerialsCsv(
  row: Pick<ReceivingLineRow, 'serials' | 'item_name'>,
): string {
  const persisted = (row.serials ?? [])
    .map((serial) => (serial.serial_number || '').trim())
    .filter(Boolean);
  if (persisted.length > 0) return persisted.join(', ');

  return parseReturnSerialTitle(row.item_name) ?? '';
}

/**
 * Most recent serial on the line (persisted units win, else title fallback).
 * Used to keep generated `Return serial …` titles aligned with the chip face.
 */
export function resolveReceivingLinePrimarySerial(
  row: Pick<ReceivingLineRow, 'serials' | 'item_name'>,
): string | null {
  const csv = resolveReceivingLineSerialsCsv(row);
  const parts = csv.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : null;
}
