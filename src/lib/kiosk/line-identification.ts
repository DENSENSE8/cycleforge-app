/**
 * Canonical identifier a cart line is claimed by — serial / IMEI / SKU.
 * Shared by paperwork and the consult Show face so the customer reads the
 * same string staff typed.
 */

import { isBuybackPayload, isRepairPayload, type KioskCartLine } from '@/lib/kiosk/cart-line';

export function lineIdentification(line: KioskCartLine): {
  label: string;
  value: string;
} {
  if (isRepairPayload(line.payload)) {
    return {
      label: 'Serial',
      value: line.payload.serialNumber?.trim() || line.payload.imei?.trim() || '—',
    };
  }
  if (isBuybackPayload(line.payload)) {
    return { label: 'IMEI', value: line.payload.imei?.trim() || '—' };
  }
  return { label: 'SKU', value: line.payload.sku?.trim() || '—' };
}
