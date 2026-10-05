/**
 * Pack scan → order, for a scan that is NOT the carrier label: the packer
 * scans the tote the pick staged, or a unit's label / serial, and the pack
 * continues on that order's primary tracking (`POST /api/packing-logs`,
 * `/api/packing/resolve-scan`).
 */

import { findOpenOrderForUnitScan, type Queryable } from '@/lib/neon/serial-units-queries';
import { pickScanKey } from '@/lib/picking/pick-scan-unit';
import { resolveToteScan, toteScanRefusal } from '@/lib/picking/tote-scan';
import type { OrgId } from '@/lib/tenancy/constants';

export type PackScanTarget =
  /** The scan names an order to pack. */
  | { kind: 'order'; via: 'tote'; orderId: number; toteCode: string }
  | { kind: 'order'; via: 'unit'; orderId: number; serialUnitId: number }
  /** A tote that cannot be packed from (`toteScanRefusal`). */
  | { kind: 'refused'; error: string }
  /** A printed unit label whose unit is on no open order — the prepack path. */
  | { kind: 'unit-not-on-order'; error: string; serialUnitId: number | null; unitKey: string };

export interface PackScanDeps {
  resolveTote: typeof resolveToteScan;
  findUnitOrder: typeof findOpenOrderForUnitScan;
}

const defaultDeps: PackScanDeps = {
  resolveTote: resolveToteScan,
  findUnitOrder: findOpenOrderForUnitScan,
};

/**
 * Tote first (a house `H-` plate or an external tote barcode), then a unit
 * (label handle, unit_uid or typed serial). `null` = the scan names neither,
 * and the caller treats it as a tracking / SKU scan exactly as before. Any
 * known unit with no open order lands on its prepack facts, regardless of
 * whether the packer scanned OEM serial, unit label, or GS1.
 */
export async function resolvePackScan(
  client: Queryable,
  orgId: OrgId,
  raw: string,
  deps: PackScanDeps = defaultDeps,
): Promise<PackScanTarget | null> {
  const tote = await deps.resolveTote(orgId, raw, client);
  if (tote) {
    const refusal = toteScanRefusal(tote);
    if (refusal) return { kind: 'refused', error: refusal };
    if (tote.orderId == null) return { kind: 'refused', error: `tote ${tote.code} is not carrying an order` };
    return { kind: 'order', via: 'tote', orderId: tote.orderId, toteCode: tote.code };
  }

  const scan = pickScanKey(raw);
  // A package label (`KIT-…`) names no single unit; it is not a pack-unit scan.
  if (!scan || scan.kind === 'package') return null;
  const unit = await deps.findUnitOrder(client, orgId, scan);
  if (unit?.orderId != null) {
    return { kind: 'order', via: 'unit', orderId: unit.orderId, serialUnitId: unit.serialUnitId };
  }
  if (unit || scan.kind === 'label') {
    return {
      kind: 'unit-not-on-order',
      error: unit ? `Unit ${scan.key} is not on an open order` : `Unit label ${scan.key} not found`,
      serialUnitId: unit?.serialUnitId ?? null,
      unitKey: scan.key,
    };
  }
  return null;
}

/** The refusal for an order the scan named that has no primary tracking yet. */
export function packScanNoTrackingError(orderRef: string): string {
  return `Order ${orderRef} has no shipping label yet — pair or buy its label before packing`;
}
