import type { ReceivingLineRow } from './receiving-line-row';

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

  const returnSerial = String(row.item_name || '').match(/^Return serial\s+(\S+)\s*$/i)?.[1];
  return returnSerial?.trim() ?? '';
}
