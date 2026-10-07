'use client';

/**
 * Client reads/writes for the shipment record — shared by the Shipped desk
 * ledger and the phone hub so both paint the same payload under one key.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { refreshDomain } from '@/lib/refresh/bus';
import type {
  ResolveShipmentExceptionBody,
  ResolveShipmentExceptionResult,
  ShipmentLookupResult,
  ShipmentRecord,
} from './shipment-record-types';

const shipmentRecordKey = (shipmentId: number) => ['shipment-record', shipmentId] as const;

async function readError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error || `${fallback} (${res.status})`);
}

export async function fetchShipmentRecord(shipmentId: number): Promise<ShipmentRecord> {
  const res = await fetch(`/api/shipments/${shipmentId}/record`, { cache: 'no-store' });
  if (!res.ok) throw await readError(res, `Package ${shipmentId} failed to load`);
  return (await res.json()) as ShipmentRecord;
}

/** Exact / key18 / last-8 tracking resolution. `null` when no package carries it. */
export async function lookupShipmentByTracking(tracking: string): Promise<ShipmentLookupResult | null> {
  const res = await fetch(`/api/shipments/lookup?tracking=${encodeURIComponent(tracking.trim())}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await readError(res, 'Tracking lookup failed');
  return (await res.json()) as ShipmentLookupResult;
}

export function useShipmentRecord(shipmentId: number | null) {
  const query = useQuery({
    queryKey: shipmentRecordKey(shipmentId ?? 0),
    queryFn: () => fetchShipmentRecord(shipmentId as number),
    enabled: shipmentId != null && shipmentId > 0,
    staleTime: 30_000,
  });
  return query;
}

export function useResolveShipmentException(shipmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ResolveShipmentExceptionBody): Promise<ResolveShipmentExceptionResult> => {
      const res = await fetch(`/api/shipments/${shipmentId}/resolve-exception`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await readError(res, 'Resolve failed');
      return (await res.json()) as ResolveShipmentExceptionResult;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(shipmentRecordKey(shipmentId), result.record);
      refreshDomain('orders.outbound');
    },
  });
}

/**
 * Re-poll this one package now (`POST /api/shipping/track/sync-one`), then
 * re-read its record so the carrier's newest words show. A failure
 * (credentials missing, the carrier timing out) rejects with its reason.
 */
export function useRefreshShipmentTracking(shipmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch('/api/shipping/track/sync-one', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shipmentId }),
      });
      if (!res.ok) throw await readError(res, 'Refresh failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: shipmentRecordKey(shipmentId) }),
  });
}
