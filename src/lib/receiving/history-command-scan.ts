/** Unbox History command-row scan classifier. */

import { decodedHandle, type ScanRoute } from '@/lib/barcode-routing';
import { parseStationCommand } from '@/lib/stations/station-command-codes';
import {
  normalizeReceivingHistorySearchField,
  type ReceivingHistorySearchField,
} from '@/lib/receiving-history-search';

/** Optional `FIELD:value` barcodes — e.g. `PO:4500123`, `SKU:HP-PSU`. */
const FIELD_PREFIX_RE =
  /^(PO|TRACKING|SKU|PRODUCT|SERIAL|ALL)\s*:\s*(.+)$/i;

export type HistoryCommandScanKind =
  | { kind: 'find'; raw: string }
  | { kind: 'field'; field: ReceivingHistorySearchField; value: string }
  | { kind: 'station_command'; code: string }
  | { kind: 'open_carton'; receivingId: number }
  | { kind: 'passthrough'; raw: string };

const FIELD_ALIAS: Record<string, ReceivingHistorySearchField> = {
  PO: 'po',
  TRACKING: 'tracking',
  SKU: 'sku',
  PRODUCT: 'product',
  SERIAL: 'serial',
  ALL: 'all',
};

/**
 * Classify a wedge buffer for Unbox History command-row routing.
 *
 * Order: station CMD-* → field-prefix → carton / unit handles → find.
 */
export function classifyHistoryCommandScan(
  rawInput: string,
  route?: ScanRoute | null,
): HistoryCommandScanKind {
  const raw = String(rawInput ?? '').trim();
  if (!raw) {
    return { kind: 'passthrough', raw: '' };
  }

  const command = parseStationCommand(raw);
  if (command) {
    return { kind: 'station_command', code: raw.trim().toUpperCase() };
  }

  const fieldHit = FIELD_PREFIX_RE.exec(raw);
  if (fieldHit) {
    const alias = fieldHit[1]!.toUpperCase();
    const value = fieldHit[2]!.trim();
    const field = FIELD_ALIAS[alias] ?? normalizeReceivingHistorySearchField(alias.toLowerCase());
    if (value) {
      return { kind: 'field', field, value };
    }
  }

  // TRUST ONLY A DECODE, NEVER A GUESS — see `decodedHandle`.
  const resolved = route ?? decodedHandle(raw);
  if (resolved) {
    if (resolved.type === 'receiving') {
      const id = Number(resolved.value.replace(/^RCV-/i, '').replace(/^R-/i, '') || resolved.value);
      // Prefer numeric id from redirect `/m/r/{id}` when value is messy.
      const fromRedirect = resolved.redirect
        ? Number(/\/m\/r\/(\d+)/i.exec(resolved.redirect)?.[1])
        : NaN;
      const receivingId = Number.isFinite(fromRedirect) && fromRedirect > 0
        ? fromRedirect
        : Number.isFinite(id) && id > 0
          ? id
          : NaN;
      if (Number.isFinite(receivingId) && receivingId > 0) {
        return { kind: 'open_carton', receivingId };
      }
      return { kind: 'passthrough', raw };
    }
    if (
      resolved.type === 'receiving-line' ||
      resolved.type === 'serial-unit' ||
      resolved.type === 'handling-unit' ||
      resolved.type === 'manifest' ||
      resolved.type === 'support-ticket' ||
      resolved.type === 'bin'
    ) {
      return { kind: 'passthrough', raw };
    }
  }

  return { kind: 'find', raw };
}
