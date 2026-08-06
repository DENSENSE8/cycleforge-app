'use client';

/**
 * Overlay state for `/receiving` / `/unbox` / `/triage`: the carton details
 * stack (with lazy enrich) and the Incoming-mode details slide-over. Owns the
 * `receiving-open-details-overlay` bridge, the Incoming row-select → panel
 * bridge, and the mode-flip cleanup.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IncomingView } from '@/lib/receiving/incoming-view';
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
  RECEIVING_OPEN_INCOMING_DETAILS_EVENT,
  type ReceivingOpenIncomingDetailsDetail,
} from '@/utils/events';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { shipmentIdFromDeliveredUnscannedRow } from '@/components/station/receiving-delivered-unscanned';
import type { HistoryTriageTarget } from '@/lib/receiving/history-triage-row';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { setDetailInspectorCollapsed } from '@/design-system/shells/detail-stack';

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
}

export interface ReceivingDetailOverlays {
  overlayLog: ReceivingDetailsLog | null;
  setOverlayLog: React.Dispatch<React.SetStateAction<ReceivingDetailsLog | null>>;
  incomingDetails: IncomingDetailsTarget | null;
  setIncomingDetails: React.Dispatch<React.SetStateAction<IncomingDetailsTarget | null>>;
  historyTriage: HistoryTriageTarget | null;
  setHistoryTriage: React.Dispatch<React.SetStateAction<HistoryTriageTarget | null>>;
  /** Re-fetch + merge the open overlay log. */
  enrichOverlayLog: (receivingId: number) => Promise<void>;
}

export function useReceivingDetailOverlays(
  isIncomingMode: boolean,
  /**
   * Incoming right-pane sub-view (`?incview=`). Any lane other than the default
   * POS table must not keep a stale PO panel open behind it — Email Triage has
   * no PO context, and the removed lane's rows are departures, not work.
   */
  incomingView: IncomingView = 'pos',
): ReceivingDetailOverlays {
  const [overlayLog, setOverlayLog] = useState<ReceivingDetailsLog | null>(null);
  // Incoming-mode details panel — populated when a row is selected in
  // mode=incoming. {po_id, po_number} so the panel renders its header label
  // immediately, then re-keys its details query on po_id change.
  const [incomingDetails, setIncomingDetails] = useState<IncomingDetailsTarget | null>(null);
  // Unbox History left-click triage slide-over (`detail:history`).
  const [historyTriage, setHistoryTriage] = useState<HistoryTriageTarget | null>(null);

  const overlayLogIdRef = useRef<string | null>(null);
  useEffect(() => {
    overlayLogIdRef.current = overlayLog?.id ?? null;
  }, [overlayLog?.id]);

  const enrichOverlayLog = useCallback(async (receivingId: number) => {
    try {
      const result = await fetchReceivingDetailsEnrich(receivingId);
      if (overlayLogIdRef.current !== String(receivingId)) return;

      if (result.kind === 'local_pickup') {
        // No parallel pickup review UI — close the carton seed. Reprint/edit
        // goes through Unbox crossfade + History SoTs.
        setOverlayLog(null);
        return;
      }
      if (result.kind === 'missing') return;

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
        receivingId: row.receiving_id ?? null,
        receivingLineId: typeof row.id === 'number' && row.id > 0 ? row.id : null,
      });
    };
    window.addEventListener('receiving-select-line', handler);
    return () => window.removeEventListener('receiving-select-line', handler);
  }, [isIncomingMode]);

  // Mode flip cleanup: Email Triage has no PO context — close any open panel.
  // Do NOT clear solely because mode ≠ Incoming: Unbox/Triage order-chip
  // Details opens the same panel via RECEIVING_OPEN_INCOMING_DETAILS_EVENT.
  useEffect(() => {
    if (isIncomingMode && incomingView === 'email') {
      setIncomingDetails(null);
      emitReceiving('receiving-clear-line');
    }
  }, [isIncomingMode, incomingView]);

  // Unbox / Triage order-chip "Details" → same Incoming connection inspector.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ReceivingOpenIncomingDetailsDetail>).detail;
      if (!detail || typeof detail !== 'object') return;
      const poId = (detail.poId || '').trim() || null;
      const shipmentId =
        detail.shipmentId != null && Number.isFinite(Number(detail.shipmentId))
          ? Number(detail.shipmentId)
          : null;
      const inboundSource = (detail.inboundSourceType || '').trim().toLowerCase() || null;
      const inboundOrderId = (detail.inboundSourceOrderId || '').trim() || null;
      const receivingId =
        detail.receivingId != null && Number.isFinite(Number(detail.receivingId)) && Number(detail.receivingId) > 0
          ? Number(detail.receivingId)
          : null;
      const receivingLineId =
        detail.receivingLineId != null &&
        Number.isFinite(Number(detail.receivingLineId)) &&
        Number(detail.receivingLineId) > 0
          ? Number(detail.receivingLineId)
          : null;
      if (!poId && shipmentId == null && !(inboundSource && inboundOrderId)) return;
      setIncomingDetails({
        poId,
        poNumber: detail.poNumber ?? null,
        shipmentId: poId ? null : shipmentId,
        inboundSourceType: inboundSource,
        inboundSourceOrderId: inboundOrderId,
        receivingId,
        receivingLineId,
      });
    };
    window.addEventListener(RECEIVING_OPEN_INCOMING_DETAILS_EVENT, handler);
    return () => window.removeEventListener(RECEIVING_OPEN_INCOMING_DETAILS_EVENT, handler);
  }, []);

  // Unbox History left-click → HistoryCartonTriagePanel; close on workspace open.
  useReceivingEvents({
    'receiving-open-history-triage': (detail) => {
      if (!detail || typeof detail !== 'object') return;
      const receivingId = Number(detail.receivingId);
      if (!Number.isFinite(receivingId) || receivingId <= 0) return;
      const receivingLineId =
        detail.receivingLineId != null &&
        Number.isFinite(Number(detail.receivingLineId)) &&
        Number(detail.receivingLineId) > 0
          ? Number(detail.receivingLineId)
          : null;
      // Row open always expands — Band 3 toggle parks without clearing target.
      setDetailInspectorCollapsed(false);
      setHistoryTriage({
        receivingId,
        receivingLineId,
        poNumber: (detail.poNumber || '').trim() || null,
        title: (detail.title || '').trim() || null,
        tracking: (detail.tracking || '').trim() || null,
        status: (detail.status || '').trim() || null,
      });
    },
    'receiving-close-history-triage': () => setHistoryTriage(null),
    'receiving-workspace-open': () => setHistoryTriage(null),
    'receiving-select-line': () => setHistoryTriage(null),
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ReceivingDetailsOverlayDetail>).detail;
      const receivingId = Number(detail?.receivingId);
      if (!Number.isFinite(receivingId) || receivingId <= 0) return;

      setOverlayLog(receivingDetailsInstantSeed(receivingId, detail?.seed));
      void enrichOverlayLog(receivingId);
    };
    window.addEventListener('receiving-open-details-overlay', handler);
    return () => window.removeEventListener('receiving-open-details-overlay', handler);
  }, [enrichOverlayLog]);

  // Ticket float claims the rail — drop receiving details so one host occupant wins.
  useEffect(() => {
    const handler = () => setOverlayLog(null);
    window.addEventListener('receiving-close-details-overlay', handler);
    return () => window.removeEventListener('receiving-close-details-overlay', handler);
  }, []);

  return {
    overlayLog,
    setOverlayLog,
    incomingDetails,
    setIncomingDetails,
    historyTriage,
    setHistoryTriage,
    enrichOverlayLog,
  };
}
