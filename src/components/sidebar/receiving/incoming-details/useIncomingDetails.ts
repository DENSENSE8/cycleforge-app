'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { useAuth } from '@/contexts/AuthContext';
import type { DetailsResponse, IncomingDetailsQuery } from './incoming-details-shared';

/** Owns the incoming record's data + actions: */
export function useIncomingDetails({
  zohoPurchaseOrderId,
  poNumberHint,
  shipmentId,
  inboundSourceType,
  inboundSourceOrderId,
  focusReceivingId,
}: IncomingDetailsQuery) {
  // Shipment-only mode: a delivered box with no resolved PO. The read keys on
  // the shipment id instead, hides PO-only actions (Sync), and its delete
  // hard-removes the shipment from Incoming.
  const isShipmentOnly = !zohoPurchaseOrderId && shipmentId != null;
  // Inbound-only mode (Universal Incoming §7.3): a non-Zoho (eBay) row with no
  // zoho PO of its own — keys on the polymorphic link identity, hides the Zoho
  // Sync, and deletes the spine line.
  const isInboundOnly =
    !zohoPurchaseOrderId &&
    shipmentId == null &&
    Boolean(inboundSourceType && inboundSourceOrderId);
  // Carton-only unpaired: dash-Order row with a receiving carton — Pairing.
  const isCartonOnly =
    !zohoPurchaseOrderId &&
    shipmentId == null &&
    !isInboundOnly &&
    focusReceivingId != null &&
    Number.isFinite(focusReceivingId) &&
    focusReceivingId > 0;
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

  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const stationChannel = safeChannelName(() => getStationChannelName(user?.organizationId!));

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
    // Polling fallback so the carrier status stays live (like the carrier's own site) even when realtime/Ably is unavailable.
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
          marketplace?: { landed?: number; updated?: number; unchanged?: number; errors?: string[] };
          shipment?: { polled?: boolean; status?: string | null };
          note?: string | null;
        };
        const landed = inbound.marketplace?.landed ?? 0;
        const updated = inbound.marketplace?.updated ?? 0;
        const reached = landed + updated + (inbound.marketplace?.unchanged ?? 0);
        const polled = inbound.shipment?.polled;
        const firstErr = inbound.marketplace?.errors?.[0];
        if (firstErr && reached === 0) {
          toast.error(firstErr);
        } else {
          toast.success(
            `Resynced${landed > 0 ? ` · ${landed} new order${landed === 1 ? '' : 's'}` : updated > 0 ? ' · updated' : ''}${polled ? ' · carrier re-polled' : ''}`,
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

  // Delete — clears the Incoming row.
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

  return {
    isShipmentOnly,
    isInboundOnly,
    isCartonOnly,
    headerOrder,
    syncing, syncOne,
    handleDelete,
    data, isLoading, isError, refetch,
    headerPo, headerTracking,
    invalidateIncoming,
  };
}

export type IncomingDetailsController = ReturnType<typeof useIncomingDetails>;
