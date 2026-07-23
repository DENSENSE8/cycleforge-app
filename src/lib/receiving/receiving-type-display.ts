/**
 * Human label for a receiving type code (PO / RETURN / REPAIR / TRADE_IN / PICKUP).
 * Derives from {@link receivingTypeMeta} so classify faces, pills, and print
 * never disagree on the display name.
 *
 * Lives here — not in `lib/print/printReceivingLabel` where it originated —
 * because it is a pure presentation-kind mapper with zero print dependencies.
 * Importing it from the print module dragged the whole label-print stack
 * (incl. the ~250 KB bwip-js barcode engine) into every consumer's client
 * bundle (useCatalog reaches most workbench surfaces).
 */

import { receivingTypeMeta } from './receiving-type-meta';

export function receivingLabelTypeDisplay(code: string | null | undefined): string {
  const key = String(code ?? '').trim();
  if (!key) return '';
  return receivingTypeMeta(key).label;
}
