/** Canonical identifier a cart line is claimed by — serial / IMEI / SKU — for the consult Show face (`consult-proposal.ts`), so the… */

import { isBuybackPayload, isRepairPayload, type KioskCartLine } from '@/lib/kiosk/cart-line';
import { splitSerials } from '@/lib/kiosk/serial-list';

/**
 * A unit's serials in ONE chip's width: the first, then `+N` for the rest
 * (`A1 +2`). A unit can carry any number (`serial-list.ts`), and the full
 * comma list belongs on the paperwork, not in a chip. Null when there is none.
 */
export function compactSerials(value: string | null | undefined): string | null {
  const [first, ...rest] = splitSerials(value);
  if (!first) return null;
  return rest.length > 0 ? `${first} +${rest.length}` : first;
}

export function lineIdentification(line: KioskCartLine): {
  label: string;
  value: string;
} {
  if (isRepairPayload(line.payload)) {
    return {
      label: 'Serial',
      value: compactSerials(line.payload.serialNumber) || line.payload.imei?.trim() || '—',
    };
  }
  if (isBuybackPayload(line.payload)) {
    return { label: 'IMEI', value: line.payload.imei?.trim() || '—' };
  }
  return { label: 'SKU', value: line.payload.sku?.trim() || '—' };
}
