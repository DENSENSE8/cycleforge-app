'use client';

/**
 * The phone's tote facts, shared by every sheet that moves stock into a tote
 * (the location's tote load, an item's Move): the open totes list, the label
 * read (`H-12`, `12`, an external code) and the remembered last tote.
 */

import { useQuery } from '@tanstack/react-query';
import { parseToteRef, type StockTote } from '@/lib/inventory/stock-places';

/** What the phone keeps between locations so the next one needs no digits. */
export type TotePrefs = { toteId: number | null; autoAll: boolean; parkOnLoad: boolean };
export const TOTE_PREFS_KEY = 'cf.mobile.location-tote.v1';
export const TOTE_PREFS_DEFAULT: TotePrefs = { toteId: null, autoAll: true, parkOnLoad: false };

/** House tote plates are `H-{id}`; ids past six digits are not on any label. */
export const TOTE_DIGITS_MAX = 6;

export const OPEN_TOTES_QUERY_KEY = ['stock-places', 'totes'] as const;

export function useOpenTotes(enabled: boolean) {
  return useQuery<StockTote[]>({
    queryKey: OPEN_TOTES_QUERY_KEY,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch('/api/stock-places', { credentials: 'include', cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as { totes?: StockTote[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error || 'Could not load totes');
      return body?.totes ?? [];
    },
  });
}

/** The open tote a scanned or typed label names, or null. */
export function findOpenTote(totes: readonly StockTote[], raw: string): StockTote | null {
  const ref = parseToteRef(raw);
  if (ref == null) return null;
  return totes.find((tote) => ('id' in ref ? tote.id === ref.id : tote.code.toUpperCase() === ref.code.toUpperCase())) ?? null;
}
