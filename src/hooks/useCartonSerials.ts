'use client';

/**
 * Distinct serial numbers on a receiving carton — shared by Timeline tab,
 * ReceivingSerialJourneys, and any carton-scoped unit trail.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export async function fetchCartonSerials(receivingId: number): Promise<string[]> {
  const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}&include=serials`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load carton serials');
  const data = await res.json().catch(() => null);
  const rows: ReceivingLineRow[] = Array.isArray(data?.receiving_lines) ? data.receiving_lines : [];
  const serials = rows.flatMap((r) =>
    (r.serials ?? [])
      .map((s) => String(s.serial_number || '').trim())
      .filter((s): s is string => s.length > 0),
  );
  return [...new Set(serials)];
}

export function cartonSerialsQueryKey(receivingId: number) {
  return ['receiving-carton-serials', receivingId] as const;
}

export function useCartonSerials(receivingId: number | string | null | undefined) {
  const id = Number(receivingId);
  const enabled = Number.isFinite(id) && id > 0;

  const query = useQuery({
    queryKey: cartonSerialsQueryKey(id),
    queryFn: () => fetchCartonSerials(id),
    enabled,
    staleTime: 30_000,
  });

  const serials = useMemo(() => query.data ?? [], [query.data]);

  return { ...query, serials, receivingId: enabled ? id : null };
}
