'use client';

/** Client for the order's labels beyond the purchase: */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LabelPurpose } from '@/lib/shipping/label-purpose';
import type { LabelLinkCandidate } from '@/lib/shipping/order-label-links';
import type { PriceBreakdown } from '@/lib/orders/order-price-breakdown';
import { orderLabelSummaryKey } from '@/lib/orders/order-paperwork-client';

const labelCandidatesKey = (orderId: number, q: string) => ['order-label-candidates', orderId, q] as const;
export const orderPriceBreakdownKey = (orderId: number) => ['order-price-breakdown', orderId] as const;

type OrderPriceBreakdownResponse = PriceBreakdown & { orderId: number; shipstationOrderNumber: string | null };

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || fallback);
  return body;
}

/** `GET /api/orders/[id]/labels?q=` — Link-label candidates. */
export function useLabelLinkCandidates(orderId: number, query: string, enabled: boolean) {
  return useQuery({
    queryKey: labelCandidatesKey(orderId, query),
    queryFn: async () =>
      readJson<{ candidates: LabelLinkCandidate[]; searchedLive: boolean }>(
        await fetch(`/api/orders/${orderId}/labels${query ? `?q=${encodeURIComponent(query)}` : ''}`, {
          credentials: 'same-origin',
        }),
        'Could not search ShipStation labels.',
      ),
    enabled: enabled && orderId > 0,
    staleTime: 15_000,
  });
}

/** `GET /api/orders/[id]/price-breakdown` — persisted rows only. */
export function useOrderPriceBreakdown(orderId: number) {
  return useQuery({
    queryKey: orderPriceBreakdownKey(orderId),
    queryFn: async () =>
      readJson<OrderPriceBreakdownResponse>(
        await fetch(`/api/orders/${orderId}/price-breakdown`, { credentials: 'same-origin' }),
        'Could not read the order’s prices.',
      ),
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  });
}

/** The label writes for one order — each refreshes the Label block + Price panel. */
export function useOrderLabelActions(orderId: number) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(orderId) });
    void queryClient.invalidateQueries({ queryKey: orderPriceBreakdownKey(orderId) });
    void queryClient.invalidateQueries({ queryKey: ['order-label-candidates', orderId] });
  };

  const link = useMutation({
    mutationFn: async (input: { shipstationShipmentId: number; purpose: LabelPurpose; clientEventId: string }) =>
      readJson<{ id: number; idempotent: boolean }>(
        await fetch(`/api/orders/${orderId}/labels`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
        'Could not link the label.',
      ),
    onSuccess: refresh,
  });

  const unlink = useMutation({
    mutationFn: async (rowId: number) =>
      readJson<{ idempotent: boolean }>(
        await fetch(`/api/orders/${orderId}/labels/${rowId}`, { method: 'DELETE', credentials: 'same-origin' }),
        'Could not unlink the label.',
      ),
    onSuccess: refresh,
  });

  const linkTicket = useMutation({
    mutationFn: async (input: { rowId: number; ticket: string }) =>
      readJson<{ ticketId: number; orderAnchored: boolean }>(
        await fetch(`/api/orders/${orderId}/labels/${input.rowId}/ticket`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket: input.ticket }),
        }),
        'Could not link the ticket.',
      ),
    onSuccess: refresh,
  });

  const unlinkTicket = useMutation({
    mutationFn: async (input: { rowId: number; ticketId: number }) =>
      readJson<{ removed: boolean }>(
        await fetch(`/api/orders/${orderId}/labels/${input.rowId}/ticket?ticketId=${input.ticketId}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        }),
        'Could not unlink the ticket.',
      ),
    onSuccess: refresh,
  });

  return { link, unlink, linkTicket, unlinkTicket };
}

/** Same-origin PDF of a label with no stored document (returns, paired ShipStation labels). */
export function orderLabelPdfSrc(orderId: number, rowId: number): string {
  return `/api/orders/${orderId}/labels/${rowId}/pdf`;
}
