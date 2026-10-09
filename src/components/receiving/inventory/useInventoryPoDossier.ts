'use client';

/** Shared inventory PO dossier read — same contract as Incoming Details (`GET /api/receiving-lines/incoming/details`). */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DetailsResponse } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';

type InventoryPoDossierKey = {
  poId: string | null;
  receivingId: number | null;
  shipmentId?: number | null;
  inboundSource?: string | null;
  inboundOrderId?: string | null;
};

function detailsQueryKey(key: InventoryPoDossierKey) {
  const poId = (key.poId || '').trim();
  const receivingId =
    key.receivingId != null && Number.isFinite(key.receivingId) && key.receivingId > 0
      ? key.receivingId
      : null;
  const shipmentId =
    key.shipmentId != null && Number.isFinite(key.shipmentId) && key.shipmentId > 0
      ? key.shipmentId
      : null;
  const inboundSource = (key.inboundSource || '').trim().toLowerCase();
  const inboundOrderId = (key.inboundOrderId || '').trim();
  const detailsKey = poId
    ? poId
    : shipmentId != null
      ? `shipment:${shipmentId}`
      : inboundSource && inboundOrderId
        ? `inbound:${inboundSource}:${inboundOrderId}`
        : receivingId != null
          ? `carton:${receivingId}`
          : '';
  return ['incoming-details', detailsKey, receivingId] as const;
}

function buildDetailsQs(key: InventoryPoDossierKey): string | null {
  const poId = (key.poId || '').trim();
  const receivingId =
    key.receivingId != null && Number.isFinite(key.receivingId) && key.receivingId > 0
      ? key.receivingId
      : null;
  const shipmentId =
    key.shipmentId != null && Number.isFinite(key.shipmentId) && key.shipmentId > 0
      ? key.shipmentId
      : null;
  const inboundSource = (key.inboundSource || '').trim().toLowerCase();
  const inboundOrderId = (key.inboundOrderId || '').trim();

  if (poId) {
    const qs = `po_id=${encodeURIComponent(poId)}`;
    return receivingId != null
      ? `${qs}&receiving_id=${encodeURIComponent(String(receivingId))}`
      : qs;
  }
  if (shipmentId != null) {
    return `shipment_id=${encodeURIComponent(String(shipmentId))}`;
  }
  if (inboundSource && inboundOrderId) {
    return `inbound_source=${encodeURIComponent(inboundSource)}&inbound_order_id=${encodeURIComponent(inboundOrderId)}`;
  }
  if (receivingId != null) {
    return `receiving_id=${encodeURIComponent(String(receivingId))}`;
  }
  return null;
}

export function useInventoryPoDossier(key: InventoryPoDossierKey) {
  const queryClient = useQueryClient();
  const qs = buildDetailsQs(key);
  const queryKey = detailsQueryKey(key);

  const query = useQuery<DetailsResponse>({
    queryKey,
    enabled: Boolean(qs),
    queryFn: async () => {
      if (!qs) throw new Error('no inventory dossier key');
      const res = await fetch(`/api/receiving-lines/incoming/details?${qs}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`details ${res.status}`);
      return res.json();
    },
    staleTime: 15_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['incoming-details'] });
    void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
  }, [queryClient]);

  const lineItems = query.data?.line_items ?? [];
  const inventoryReceived = lineItems.reduce((sum, l) => sum + (l.quantity_received || 0), 0);
  const inventoryExpected = lineItems.reduce((sum, l) => sum + (l.quantity_expected || 0), 0);

  return {
    ...query,
    data: query.data ?? null,
    invalidate,
    inventoryReceived,
    inventoryExpected,
    isPaired: Boolean((key.poId || '').trim() || query.data?.po),
  };
}
