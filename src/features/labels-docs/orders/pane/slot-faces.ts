/**
 * Faces the Orders view paints for an order's slots — one table, read by the
 * pane's slots and the list row's slot strip alike.
 */

import type { RecordStateFace } from '@/design-system/tokens/record';
import type { PacketSlotState } from '@/lib/label-prints/order-packet-contracts';
import type { PaperworkSource } from '@/lib/manuals/paperwork-pairing';

export const SLOT_STATE_FACE: Readonly<Record<PacketSlotState, RecordStateFace>> = {
  filled: { id: 'filled', code: 'FIL', label: 'Filled', tone: 'success', icon: 'check' },
  missing: { id: 'missing', code: 'MIS', label: 'Missing', tone: 'danger', icon: 'package-x' },
  not_required: { id: 'not_required', code: 'N/R', label: 'Not required', tone: 'neutral', icon: 'circle-pause' },
  review: { id: 'review', code: 'REV', label: 'Needs review', tone: 'warning', icon: 'package-search' },
};

/** Where a paperwork document resolves from — the source badge on every filled paperwork row. */
export const PAPERWORK_SOURCE_FACE: Readonly<Record<PaperworkSource, string>> = {
  sku: 'SKU',
  item_number: 'Item #',
  order: 'This order',
};

/** Label uploads are PDFs (the batch splitter reads pages). */
export const LABEL_DROP_TYPES: readonly string[] = ['application/pdf'];

/** What the paperwork writers accept (packing slips, product paperwork). */
export const PAPERWORK_UPLOAD_TYPES: readonly string[] = ['application/pdf', 'image/png', 'image/jpeg'];

/** "Printed ×2" / "Unprinted". */
export function printedFace(printCount: number): string {
  return printCount > 0 ? `Printed ×${printCount}` : 'Unprinted';
}
