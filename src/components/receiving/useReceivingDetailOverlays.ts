'use client';

/**
 * Overlay state for `/receiving`: the carton details stack (with lazy enrich),
 * the local-pickup review panel, and the Incoming-mode details slide-over.
 * Owns the `receiving-open-details-overlay` bridge, the Incoming row-select →
 * panel bridge, and the mode-flip cleanup. Extracted from ReceivingDashboard;
 * behaviour is unchanged.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchReceivingDetailsEnrich,
  receivingDetailsInstantSeed,
} from '@/lib/receiving/receiving-details-overlay';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import type { ReceivingDetailsOverlayDetail } from '@/utils/events';
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
  overlayLog: ReceivingDetailsLog | null;
  setOverlayLog: React.Dispatch<React.SetStateAction<ReceivingDetailsLog | null>>;
  pickupReviewOrderId: number | null;
  setPickupReviewOrderId: React.Dispatch<React.SetStateAction<number | null>>;
  incomingDetails: IncomingDetailsTarget | null;
  setIncomingDetails: React.Dispatch<React.SetStateAction<IncomingDetailsTarget | null>>;
  /** Re-fetch + merge the open overlay log (or hand off to the pickup review). */
  enrichOverlayLog: (receivingId: number) => Promise<void>;
}

export function useReceivingDetailOverlays(
  isIncomingMode: boolean,
  /** Incoming POS vs Email Triage (`?incview=`). Email must not keep a stale PO panel. */
  incomingView: 'pos' | 'email' = 'pos',
): ReceivingDetailOverlays {
  const [overlayLog, setOverlayLog] = useState<ReceivingDetailsLog | null>(null);
  // A finalized local pickup PO opens its own review/reprint panel instead of
  // the generic carton details stack (it has no receiving_lines).
  const [pickupReviewOrderId, setPickupReviewOrderId] = useState<number | null>(null);
  // Incoming-mode details panel — populated when a row is selected in
  // mode=incoming. {po_id, po_number} so the panel renders its header label
  // immediately, then re-keys its details query on po_id change.
  const [incomingDetails, setIncomingDetails] = useState<IncomingDetailsTarget | null>(null);

  const overlayLogIdRef = useRef<string | null>(null);
  useEffect(() => {
    overlayLogIdRef.current = overlayLog?.id ?? null;
  }, [overlayLog?.id]);

  const enrichOverlayLog = useCallback(async (receivingId: number) => {
    try {
      const result = await fetchReceivingDetailsEnrich(receivingId);
      if (overlayLogIdRef.current !== String(receivingId)) return;

      if (result.kind === 'local_pickup') {
        setOverlayLog(null);
        setPickupReviewOrderId(result.orderId);
        return;
      }
      if (result.kind === 'missing') return;

      setPickupReviewOrderId(null);
      setOverlayLog((prev) =>
        prev?.id === String(receivingId) ? { ...prev, ...result.log } : prev,
      );
    } catch {
      // Keep the instant seed visible when enrichment fails.
    }
  }, []);

  // Keep the open carton overlay LIVE: `unboxed_at`/`received_at` and the
  // Progress stepper are seeded into `overlayLog` state, so a mutation elsewhere
  // (condition edit, serial scan, receive, unbox acknowledgement) that stamps a
  // milestone must re-enrich the open panel — otherwise it shows the stale seed
  // until the operator hits Refresh. The server publishes `receiving-log.changed`
  // (carton id as `rowId`) on every such write; re-enrich when it matches the
  // open overlay. Ably echoes to the publishing client, so a same-browser edit
  // updates too.
  const { user } = useAuth();
  const stationChannel = safeChannelName(() => getStationChannelName(user!.organizationId));
  useAblyChannel(
    stationChannel,
    'receiving-log.changed',
    (msg: { data?: { rowId?: string | number | null } }) => {
      const rowId = msg?.data?.rowId != null ? String(msg.data.rowId) : '';
      if (rowId && rowId === overlayLogIdRef.current) {
        void enrichOverlayLog(Number(rowId));
      }
    },
    !!stationChannel && overlayLog != null,
  );

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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ReceivingDetailsOverlayDetail>).detail;
      const receivingId = Number(detail?.receivingId);
      if (!Number.isFinite(receivingId) || receivingId <= 0) return;

      setPickupReviewOrderId(null);
      setOverlayLog(receivingDetailsInstantSeed(receivingId, detail?.seed));
      void enrichOverlayLog(receivingId);
    };
    window.addEventListener('receiving-open-details-overlay', handler);
    return () => window.removeEventListener('receiving-open-details-overlay', handler);
  }, [enrichOverlayLog]);

  return {
    overlayLog,
    setOverlayLog,
    pickupReviewOrderId,
    setPickupReviewOrderId,
    incomingDetails,
    setIncomingDetails,
    enrichOverlayLog,
  };
}
