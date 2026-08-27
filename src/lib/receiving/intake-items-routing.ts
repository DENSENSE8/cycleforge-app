/**
 * PO vs return vs unfound — which workspace "items" surface to mount.
 *
 * Returns and sales-order pairings (serial autolink, Ecwid order #) must NOT use
 * the Zoho PO accordion (`PoLinesAccordion`). Only cartons with a real
 * `zoho_purchaseorder_id` and a non-RETURN intake kind use that path.
 *
 * SoT for UI routing — import this instead of branching on `receiving_source`
 * alone (returns masquerade as `source = 'zoho_po'` with a null Zoho PO id).
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';

type RowSlice = Pick<
  ReceivingLineRow,
  'receiving_id' | 'receiving_source' | 'zoho_purchaseorder_id' | 'intake_type' | 'receiving_type' | 'carton_intake_type'
>;

/** Linked to a real Zoho PO record (not an order# display rep on a return). */
export function hasRealZohoPoId(row: Pick<ReceivingLineRow, 'zoho_purchaseorder_id'>): boolean {
  return Boolean((row.zoho_purchaseorder_id || '').trim());
}

/**
 * Matched carton with an order#/platform pairing but no real Zoho PO id — serial
 * returns, Ecwid imports, Amazon order links, etc.
 */
export function isSalesOrderLinkage(
  row: Pick<ReceivingLineRow, 'receiving_source' | 'zoho_purchaseorder_id'>,
): boolean {
  return row.receiving_source === 'zoho_po' && !hasRealZohoPoId(row);
}

/** Server-side carton row (`receiving` table) — same rule as {@link isSalesOrderLinkage}. */
export function isSalesOrderDerivedCarton(carton: {
  source: string | null;
  zoho_purchaseorder_id: string | null;
}): boolean {
  return carton.source === 'zoho_po' && !hasRealZohoPoId(carton);
}

/**
 * A receiving line's source lane. Post-unification BOTH lanes render the same
 * one-row surface (`PoLinesAccordion` — the matched carton mounts it directly,
 * the unfound carton mounts it inside `UnmatchedAccordionSurface`), so this is a
 * **source classifier**, not a surface switch: it selects which sibling
 * controller layer drives the shared row surface
 * (receiving-condition-serial-unification-plan.md, Phase 3).
 *
 *   - `'unmatched'` → `useUnmatchedItems` layer (serial scan → create line,
 *      Ecwid add, return lines, door classification, unlink).
 *   - `'po'`        → `useUnboxLineController` layer (Zoho PO receive/print).
 */
export type LineSource = 'po' | 'unmatched';

/** Classify a line's source lane (drives which controller layer, not the surface). */
export function classifyLineSource(row: RowSlice): LineSource {
  if (row.receiving_source === 'unmatched') return 'unmatched';
  if (isReturnIntake(row)) return 'unmatched';
  if (isSalesOrderLinkage(row)) return 'unmatched';
  return 'po';
}

/**
 * The `'unmatched'` source lane — serial scan, Ecwid add, return lines. Thin
 * boolean alias over {@link classifyLineSource} kept for the many existing
 * call sites; new code should prefer the classifier so the source is explicit.
 */
export function shouldUseUnmatchedItemsSurface(row: RowSlice): boolean {
  return classifyLineSource(row) === 'unmatched';
}

/** The `'po'` source lane — real Zoho PO cartons that receive against inventory. */
export function shouldUsePoAccordion(row: RowSlice): boolean {
  if (row.receiving_id == null) return false;
  return classifyLineSource(row) === 'po';
}

/**
 * Zoho purchase-receive is invalid — local receive only (unmatched, returns,
 * sales-order-linked cartons).
 */
export function shouldUseLocalReceiveOnly(row: RowSlice): boolean {
  return shouldUseUnmatchedItemsSurface(row);
}
