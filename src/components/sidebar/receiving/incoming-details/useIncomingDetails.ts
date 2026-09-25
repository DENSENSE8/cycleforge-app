'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { useAuth } from '@/contexts/AuthContext';
import type { DetailsResponse, IncomingDetailsPanelProps, TabId } from './incoming-details-shared';

/**
 * Owns the incoming-details panel's data + actions: the consolidated details
 * query (PO- or shipment-keyed, with 60s carrier polling), Ably `shipment.changed`
 * live refresh, per-order Sync (Zoho re-pull + carrier re-poll), the two-step
 * delete (PO lines or PO-less shipment row), and the derived header/mode flags.
 * Returns a controller bag the thin panel shell renders from.
 */
export function useIncomingDetails({
  zohoPurchaseOrderId,
  poNumberHint,
  shipmentId,
  inboundSourceType,
  inboundSourceOrderId,
  focusReceivingId,
}: IncomingDetailsPanelProps) {
  // Shipment-only mode: a delivered box with no resolved PO. The panel keys on
  // the shipment id instead, defaults to the Shipment tab, hides PO-only actions
  // (Sync), and its delete hard-removes the shipment from Incoming.
  const isShipmentOnly = !zohoPurchaseOrderId && shipmentId != null;
  // Inbound-only mode (Universal Incoming §7.3): a non-Zoho (eBay) row with no
  // zoho PO of its own — the panel keys on the polymorphic link identity, defaults
  // to the eBay tab, hides the Zoho Sync, and deletes the spine line.
  const isInboundOnly =
    !zohoPurchaseOrderId &&
    shipmentId == null &&
    Boolean(inboundSourceType && inboundSourceOrderId);
  // Carton-only unpaired: dash-Order row with a receiving carton — Pairing tab.
  const isCartonOnly =
    !zohoPurchaseOrderId &&
    shipmentId == null &&
    !isInboundOnly &&
    focusReceivingId != null &&
    Number.isFinite(focusReceivingId) &&
    focusReceivingId > 0;
  // Unpaired (no Zoho PO) opens on Pairing — Package Pairing is the job.
  const defaultTab: TabId = !zohoPurchaseOrderId
    ? isInboundOnly
      ? 'ebay'
      : 'pairing'
    : 'po';
  // Stable react-query key for the details fetch in each mode.
  const detailsKey = zohoPurchaseOrderId
    ?? (shipmentId != null
      ? `shipment:${shipmentId}`
      : isInboundOnly
        ? `inbound:${inboundSourceType}:${inboundSourceOrderId}`
        : isCartonOnly
          ? `carton:${focusReceivingId}`
          : '');
  const focusKey =
    focusReceivingId != null && Number.isFinite(focusReceivingId) && focusReceivingId > 0
      ? focusReceivingId
      : null;

  const [tab, setTab] = useState<TabId>(defaultTab);
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const stationChannel = safeChannelName(() => getStationChannelName(user?.organizationId!));

  // Reset to the default tab when the row changes (PO id / shipment id / inbound id).
  useEffect(
    () => setTab(defaultTab),
    [zohoPurchaseOrderId, shipmentId, inboundSourceOrderId, focusReceivingId, defaultTab],
  );

  const invalidateIncoming = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['incoming-details', detailsKey, focusKey] });
    queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
    queryClient.invalidateQueries({ queryKey: ['receiving-lines-incoming-summary'] });
    queryClient.invalidateQueries({ queryKey: ['incoming-delivered-unscanned'] });
  }, [queryClient, detailsKey, focusKey]);

  const { data, isLoading, isError, refetch } = useQuery<DetailsResponse>({
    queryKey: ['incoming-details', detailsKey, focusKey],
    queryFn: async ({ signal }) => {
      const qs = isShipmentOnly
        ? `shipment_id=${encodeURIComponent(String(shipmentId))}`
        : isInboundOnly
          ? `inbound_source=${encodeURIComponent(inboundSourceType ?? '')}&inbound_order_id=${encodeURIComponent(inboundSourceOrderId ?? '')}`
          : isCartonOnly
            ? `receiving_id=${encodeURIComponent(String(focusReceivingId))}`
            : `po_id=${encodeURIComponent(zohoPurchaseOrderId ?? '')}`;
      const focusQs =
        !isCartonOnly && focusKey != null
          ? `${qs}&receiving_id=${encodeURIComponent(String(focusKey))}`
          : qs;
      const res = await fetch(`/api/receiving-lines/incoming/details?${focusQs}`, { cache: 'no-store', signal });
      if (!res.ok) throw new Error(`details ${res.status}`);
      return res.json();
    },
    enabled: Boolean(detailsKey),
    staleTime: 15_000,
    // Polling fallback so the carrier status stays live (like the carrier's
    // own site) even when realtime/Ably is unavailable. Only this open panel
    // polls — one PO row per minute — and pauses when the tab is hidden, so the
    // DB cost stays negligible.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Per-order Sync — re-pull this one PO's Zoho header/status + re-poll its
  // shipment, without running the whole Incoming sweep. For inbound-only rows
  // (eBay / marketplace), re-pull from linked buyer accounts instead.
  const syncOne = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/receiving-lines/incoming/sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isInboundOnly
            ? {
                inbound_source: inboundSourceType,
                inbound_order_id: inboundSourceOrderId,
                account_label: data?.inbound?.account_label ?? null,
              }
            : { po_id: zohoPurchaseOrderId },
        ),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        toast.error(body?.error || `Sync failed (${res.status})`);
        return;
      }
      if (isInboundOnly && body?.inbound) {
        const inbound = body.inbound as {
          marketplace?: { ingested?: number; created?: number; errors?: string[] };
          shipment?: { polled?: boolean; status?: string | null };
          note?: string | null;
        };
        const ingested = inbound.marketplace?.ingested ?? 0;
        const created = inbound.marketplace?.created ?? 0;
        const polled = inbound.shipment?.polled;
        const firstErr = inbound.marketplace?.errors?.[0];
        if (firstErr && ingested === 0) {
          toast.error(firstErr);
        } else {
          toast.success(
            `Resynced${created > 0 ? ` · ${created} new line${created === 1 ? '' : 's'}` : ingested > 0 ? ' · updated' : ''}${polled ? ' · carrier re-polled' : ''}`,
          );
        }
        if (inbound.note) toast.success(inbound.note);
      } else {
        const status = body?.mirror?.status as string | null;
        const polled = body?.shipment?.polled as boolean | undefined;
        toast.success(
          `Synced${status ? ` · PO: ${status}` : ''}${polled ? ' · carrier re-polled' : ''}`,
        );
      }
      invalidateIncoming();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [
    syncing,
    zohoPurchaseOrderId,
    isInboundOnly,
    inboundSourceType,
    inboundSourceOrderId,
    data?.inbound?.account_label,
    invalidateIncoming,
  ]);

  // Delete — clears the Incoming row. For a PO it removes EVERY receiving_line
  // for that PO (Zoho untouched; a future sync may re-add it). For a PO-less
  // delivered box it hard-deletes the shipment row (there's no receiving_line to
  // delete). For an inbound-only (eBay) row it deletes the spine line by id.
  // Throws on failure so InspectorFlushDelete skips its onDeleted (close).
  const handleDelete = useCallback(async () => {
    const inboundLineId = isInboundOnly ? data?.inbound?.receiving_line_id ?? null : null;
    const cartonLineId =
      isCartonOnly && data?.line_items?.[0]?.receiving_line_id != null
        ? data.line_items[0].receiving_line_id
        : null;
    const url = isShipmentOnly
      ? `/api/receiving-lines?shipment_id=${encodeURIComponent(String(shipmentId))}`
      : inboundLineId != null
        ? `/api/receiving-lines?id=${encodeURIComponent(String(inboundLineId))}`
        : cartonLineId != null
          ? `/api/receiving-lines?id=${encodeURIComponent(String(cartonLineId))}`
          : `/api/receiving-lines?po_id=${encodeURIComponent(zohoPurchaseOrderId ?? '')}`;
    const res = await fetch(url, { method: 'DELETE' });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      const msg = body?.error || `Delete failed (${res.status})`;
      toast.error(msg);
      throw new Error(msg);
    }
    toast.success(
      isShipmentOnly || inboundLineId != null || cartonLineId != null
        ? 'Removed from Incoming'
        : `Removed from Incoming (${body?.deleted ?? 0} line${body?.deleted === 1 ? '' : 's'})`,
    );
    invalidateIncoming();
  }, [
    isShipmentOnly,
    isInboundOnly,
    isCartonOnly,
    shipmentId,
    zohoPurchaseOrderId,
    data,
    invalidateIncoming,
  ]);

  // Realtime: a carrier webhook (or poll) that updates this shipment fires
  // `shipment.changed`; refresh the panel + the incoming list/summary instantly
  // so the displayed status matches the carrier's live state without a reload.
  useAblyChannel(stationChannel, 'shipment.changed', () => {
    queryClient.invalidateQueries({ queryKey: ['incoming-details', detailsKey, focusKey] });
    queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
    queryClient.invalidateQueries({ queryKey: ['receiving-lines-incoming-summary'] });
  }, !!stationChannel);

  const headerPo = poNumberHint || data?.po?.zoho_purchaseorder_number || '';
  // Shipment-only / carton-only rows have no PO chip — fall back to tracking#.
  const headerTracking =
    isShipmentOnly || isCartonOnly
      ? (data?.shipment?.tracking_number || '').trim()
      : '';
  // Inbound-only (eBay) rows identify by their external order id.
  const headerOrder = isInboundOnly
    ? (data?.inbound?.order_number || inboundSourceOrderId || '').trim()
    : '';

  // After a successful Pairing link the details payload gains a PO — leave the
  // Pairing tab so the operator lands on the PO face.
  useEffect(() => {
    if (tab === 'pairing' && data?.po?.zoho_purchaseorder_id) {
      setTab('po');
    }
  }, [tab, data?.po?.zoho_purchaseorder_id]);

  return {
    isShipmentOnly,
    isInboundOnly,
    isCartonOnly,
    headerOrder,
    tab, setTab,
    syncing, syncOne,
    handleDelete,
    data, isLoading, isError, refetch,
    headerPo, headerTracking,
    invalidateIncoming,
  };
}

export type IncomingDetailsController = ReturnType<typeof useIncomingDetails>;
