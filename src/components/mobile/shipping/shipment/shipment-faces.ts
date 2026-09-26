import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * Words and faces the package hub and its screens share. Every instant on the
 * record is ISO with an offset; it is painted in America/Los_Angeles
 * (`formatMonthDayTimePST` dense, `formatDateTimePST` on /info).
 */

/** The unmatched pack scan still waiting for a person — the one thing the dock can fix. */
export function openShipmentException(record: ShipmentRecord) {
  return record.exception?.status === 'open' ? record.exception : null;
}

/** What is in the box, as a title: the first line (+ how many more), or the honest "no order". */
export function shipmentItemsTitle(record: ShipmentRecord): string {
  const [first, ...rest] = record.items;
  if (!first) return openShipmentException(record) ? 'Pack scan matched no order' : 'No order lines on this package';
  return rest.length > 0 ? `${first.title} + ${rest.length} more` : first.title;
}

export function shipmentPackedLine(record: ShipmentRecord): string {
  if (!record.pack) return 'Never pack-scanned';
  return `Packed by ${record.pack.packerName ?? 'unknown'} · ${formatMonthDayTimePST(record.pack.packedAt)}`;
}

export function shipmentShippedLine(record: ShipmentRecord): string {
  if (!record.shipOut) return 'Not scanned out';
  return `Shipped ${formatMonthDayTimePST(record.shipOut.at)}${record.shipOut.backfilled ? ' · Backfilled' : ''}`;
}

/** The carrier's own word for where the box is, or null when the carrier has said nothing. */
export function shipmentCarrierStatus(record: ShipmentRecord): string | null {
  return record.status.label ?? record.status.description ?? record.status.category;
}

/**
 * The chip on the summary card: an open unmatched scan outranks everything,
 * then the carrier's word, then our own last scan.
 */
export function shipmentChip(record: ShipmentRecord): { label: string; className: string } | null {
  const tone = (name: keyof typeof STATE_TONE_CLASSES) =>
    `${STATE_TONE_CLASSES[name].pill} ${STATE_TONE_CLASSES[name].border}`;
  if (openShipmentException(record)) return { label: 'Unmatched scan', className: tone('danger') };
  if (record.status.isDelivered) return { label: 'Delivered', className: tone('success') };
  const carrier = shipmentCarrierStatus(record);
  if (record.status.hasException) return { label: carrier ?? 'Carrier exception', className: tone('danger') };
  if (carrier) return { label: carrier, className: tone('info') };
  if (record.shipOut) return { label: 'Scanned out', className: tone('fulfillment') };
  if (record.pack) return { label: 'Packed', className: tone('info') };
  return null;
}
