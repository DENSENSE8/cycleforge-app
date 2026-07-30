'use client';

/**
 * Overlay state for `/receiving`: Incoming-mode details slide-over only.
 *
 * Carton "look" navigates to `/carton/[id]` via `dispatchReceivingDetailsOverlay`
 * (decision 2a) — editable ReceivingDetailsStack is no longer mounted here.
 */

import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  shipmentIdFromDeliveredUnscannedRow,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';

export interface IncomingDetailsTarget {
  poId: string | null;
  poNumber: string | null;
  shipmentId: number | null;
  /** Universal Incoming (§7.3): a non-Zoho row keys on its link identity. */
  inboundSourceType?: string | null;
  inboundSourceOrderId?: string | null;
}

export interface ReceivingDetailOverlays {
  incomingDetails: IncomingDetailsTarget | null;
  setIncomingDetails: React.Dispatch<React.SetStateAction<IncomingDetailsTarget | null>>;
}

export function useReceivingDetailOverlays(
  isIncomingMode: boolean,
  /** Incoming POS vs Email Triage (`?incview=`). Email must not keep a stale PO panel. */
  incomingView: 'pos' | 'email' = 'pos',
): ReceivingDetailOverlays {
  // Incoming-mode details panel — populated when a row is selected in
  // mode=incoming. {po_id, po_number} so the panel renders its header label
  // immediately, then re-keys its details query on po_id change.
  const [incomingDetails, setIncomingDetails] = useState<IncomingDetailsTarget | null>(null);

  // Incoming-mode row select → open the IncomingDetailsPanel overlay. Listens on
  // the same `receiving-select-line` event the table dispatches; the mode check
  // gates so a select in Receiving keeps opening the workspace.
  useEffect(() => {
    if (!isIncomingMode) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const row =
        detail && typeof detail === 'object' && 'row' in detail
          ? ((detail as { row: ReceivingLineRow | null }).row)
          : (detail as ReceivingLineRow | null);
      if (!row) {
        setIncomingDetails(null);
        return;
      }
      const poId = (row.zoho_purchaseorder_id || '').trim();
      // A "Delivered · not scanned" box that never resolved to a PO is shipment-
      // anchored (synthetic row, receiving_id null). Recover its shipment id so
      // the panel can still open (shipment-only mode) and offer a hard delete.
      const shipmentId = shipmentIdFromDeliveredUnscannedRow(row);
      // Universal Incoming (§7.3): a non-Zoho row (eBay buyer purchase) has no
      // zoho PO — key the panel on its polymorphic link identity instead.
      const inboundSource = (row.inbound_source_type || '').trim().toLowerCase();
      const inboundOrderId = (row.source_order_id || '').trim();
      const isInbound = !poId && inboundSource !== '' && inboundSource !== 'zoho' && inboundOrderId !== '';
      if (!poId && shipmentId == null && !isInbound) {
        // Neither a PO, a shipment-anchored delivered box, nor an inbound row →
        // nothing the panel can render. Deterministic feedback, not a dead click.
        const tracking = (row.tracking_number || '').trim();
        toast.info(tracking ? 'Delivered box not linked to a PO yet' : 'No linked PO for this row yet');
        return;
      }
      setIncomingDetails({
        poId: poId || null,
        poNumber: row.zoho_purchaseorder_number ?? null,
        // Prefer the richer PO view when a PO exists; fall back to shipment-only,
        // else the inbound (eBay) identity.
        shipmentId: poId ? null : shipmentId,
        inboundSourceType: isInbound ? inboundSource : null,
        inboundSourceOrderId: isInbound ? inboundOrderId : null,
      });
    };
    window.addEventListener('receiving-select-line', handler);
    return () => window.removeEventListener('receiving-select-line', handler);
  }, [isIncomingMode]);

  // Mode flip or Email Triage sub-view → close any open incoming panel so it
  // doesn't leak into Receiving / Email Triage.
  useEffect(() => {
    if (!isIncomingMode) {
      setIncomingDetails(null);
      return;
    }
    if (incomingView === 'email') {
      setIncomingDetails(null);
      window.dispatchEvent(new CustomEvent('receiving-clear-line'));
    }
  }, [isIncomingMode, incomingView]);

  return {
    incomingDetails,
    setIncomingDetails,
  };
}
