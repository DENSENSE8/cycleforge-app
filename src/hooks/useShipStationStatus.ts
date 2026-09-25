'use client';

import { useQuery } from '@tanstack/react-query';
import type { ShipStationStatus } from '@/lib/shipping/shipstation/status';

/**
 * This org's ShipStation key health — GET /api/integrations/shipstation/health.
 * `active` (v1 + v2 both live) switches order sync to ShipStation only.
 *
 * A failed request (403 / network) throws, so it is never cached as a verdict;
 * `status` is then `null` ("unknown") and callers keep today's behaviour.
 */

export const shipStationStatusKey = ['shipstation-status'] as const;

export interface ShipStationHealth extends ShipStationStatus {
  ok: boolean;
  /** Which key is not active, when `ok` is false. */
  error?: string;
}

async function fetchStatus(): Promise<ShipStationHealth> {
  const res = await fetch('/api/integrations/shipstation/health', { cache: 'no-store' });
  if (!res.ok) throw new Error(`ShipStation health ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') throw new Error('ShipStation health: malformed response');
  return data as ShipStationHealth;
}

export function useShipStationStatus() {
  const query = useQuery({
    queryKey: shipStationStatusKey,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: fetchStatus,
  });
  return { status: query.data ?? null, loading: query.isPending };
}
