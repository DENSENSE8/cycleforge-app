'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { qk } from '@/queries/keys';
import type { CartonHubData } from '@/lib/receiving/carton-hub';

async function fetchCarton(id: number, signal?: AbortSignal): Promise<CartonHubData> {
  const res = await fetch(`/api/receiving/${id}`, { cache: 'no-store', signal });
  const body = await res.json().catch(() => null);
  if (res.status === 404) throw new Error(`No carton R-${id}.`);
  if (!res.ok || !body?.success) throw new Error(body?.error || `Couldn't load R-${id} (HTTP ${res.status}).`);
  return body as CartonHubData;
}

/**
 * The carton's one read (`GET /api/receiving/[id]`), shared by the hub and
 * every door screen through `qk.cartons.hub(id, 'record')`, so moving hub ↔
 * door is a cache hit. The `/m/r/[id]` layout's receiving subscription keeps it
 * live.
 */
export function useCartonHub() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const valid = Number.isInteger(id) && id > 0;
  const query = useQuery({
    queryKey: qk.cartons.hub(id, 'record'),
    queryFn: ({ signal }) => fetchCarton(id, signal),
    enabled: valid,
  });
  return {
    id,
    data: query.data ?? null,
    loading: valid && query.isPending,
    error: !valid ? `"${params?.id ?? ''}" is not a carton id.` : query.error instanceof Error ? query.error.message : null,
    reload: query.refetch,
  };
}
