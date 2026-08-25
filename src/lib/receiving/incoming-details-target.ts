/**
 * Resolve an Incoming grid row into an {@link IncomingDetailsTarget} for the
 * desk inspector (`detail:incoming`). Shared by the dblclick / Enter open path
 * and Incoming 1-check → inspect (selection occupancy).
 */

import { shipmentIdFromDeliveredUnscannedRow } from '@/lib/receiving/receiving-delivered-unscanned';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export interface IncomingDetailsTarget {
  poId: string | null;
  poNumber: string | null;
  shipmentId: number | null;
  /** Universal Incoming (§7.3): a non-Zoho row keys on its link identity. */
  inboundSourceType?: string | null;
  inboundSourceOrderId?: string | null;
  /** Unbox/Triage carton focus — preferred receiving row for notes/shipment. */
  receivingId?: number | null;
  /** Active line focus — PoTab highlights matching line_items row. */
  receivingLineId?: number | null;
  /**
   * Grid row that opened the panel — seeds Package Pairing (`CartonMatchHub`)
   * without a second fetch. Absent for order-chip Details opens.
   */
  seedRow?: ReceivingLineRow | null;
}

type IncomingDetailsFromRowResult =
  | { ok: true; target: IncomingDetailsTarget }
  | { ok: false; toast: string };

/**
 * Map a receiving-line (or delivered-unscanned stub) to an inspector target.
 * Open when any of: Zoho PO, shipment anchor, non-Zoho inbound identity, or a
 * real carton (`receiving_id`) — the last covers unpaired / dash-Order rows
 * that still need Package Pairing.
 */
export function incomingDetailsTargetFromRow(
  row: ReceivingLineRow,
): IncomingDetailsFromRowResult {
  const poId = (row.zoho_purchaseorder_id || '').trim();
  const shipmentId = shipmentIdFromDeliveredUnscannedRow(row);
  const inboundSource = (row.inbound_source_type || '').trim().toLowerCase();
  const inboundOrderId = (row.source_order_id || '').trim();
  const isInbound =
    !poId && inboundSource !== '' && inboundSource !== 'zoho' && inboundOrderId !== '';
  const receivingId =
    row.receiving_id != null &&
    Number.isFinite(Number(row.receiving_id)) &&
    Number(row.receiving_id) > 0
      ? Number(row.receiving_id)
      : null;

  if (!poId && shipmentId == null && !isInbound && receivingId == null) {
    const tracking = (row.tracking_number || '').trim();
    return {
      ok: false,
      toast: tracking
        ? 'Delivered box not linked to a PO yet'
        : 'No linked PO for this row yet',
    };
  }

  return {
    ok: true,
    target: {
      poId: poId || null,
      poNumber: row.zoho_purchaseorder_number ?? null,
      // Prefer the richer PO view when a PO exists; fall back to shipment-only,
      // else inbound / carton-only.
      shipmentId: poId ? null : shipmentId,
      inboundSourceType: isInbound ? inboundSource : null,
      inboundSourceOrderId: isInbound ? inboundOrderId : null,
      receivingId,
      receivingLineId: typeof row.id === 'number' && row.id > 0 ? row.id : null,
      seedRow: row,
    },
  };
}
