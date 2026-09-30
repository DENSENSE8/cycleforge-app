'use client';

/**
 * Every place a SKU can be put or paired, as ONE `SearchableSelectField`
 * list: the org's open totes (`H-{id}` plates, `GET /api/stock-places`) then
 * every barcoded location (`useLocationPickerOptions`). A tote that has never
 * held stock has no location row yet — its option resolves through
 * `POST /api/stock-places`, which creates it, so the caller always writes
 * against a barcode (`resolve`).
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocationPickerOptions } from '@/hooks/useLocationPickerOptions';
import { skuExceptionLocationFace } from '@/lib/inventory/sku-exception-links';
import type { StockTote } from '@/lib/inventory/stock-places';

const STOCK_TOTES_QUERY_KEY = ['stock-places', 'totes'] as const;
const TOTE_VALUE_PREFIX = 'tote:';

export interface StockPlaceOption {
  /** A location barcode, or `tote:{code}` for a tote with no stock location yet. */
  value: string;
  label: string;
  meta?: string;
  group: 'Totes' | 'Locations';
}

export function useStockPlaceOptions({ enabled = true }: { enabled?: boolean } = {}): {
  options: readonly StockPlaceOption[];
  loading: boolean;
  /** How the chosen option reads (`H-12`, `C-02-01-2-00`). */
  faceOf: (value: string) => string;
  /** The barcode to write against — creates a tote's stock location on first use. */
  resolve: (value: string) => Promise<string>;
} {
  const queryClient = useQueryClient();
  const locations = useLocationPickerOptions({ enabled });
  const totes = useQuery<StockTote[]>({
    queryKey: STOCK_TOTES_QUERY_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch('/api/stock-places', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load totes');
      const json = (await res.json()) as { totes?: StockTote[] };
      return json.totes ?? [];
    },
  });

  const options = useMemo<StockPlaceOption[]>(() => {
    const toteCodes = new Set<string>();
    const toteOptions = (totes.data ?? []).map((tote): StockPlaceOption => {
      toteCodes.add(tote.code.toUpperCase());
      return {
        value: tote.locationBarcode ?? `${TOTE_VALUE_PREFIX}${tote.code}`,
        label: tote.code,
        meta: tote.status ? `Tote · ${tote.status.toLowerCase()}` : 'Tote',
        group: 'Totes',
      };
    });
    const locationOptions = locations.options
      // A tote's stock location already reads as its tote row.
      .filter((option) => !toteCodes.has(option.value.toUpperCase()))
      .map((option): StockPlaceOption => ({
        value: option.value,
        label: skuExceptionLocationFace(option.value),
        meta: option.meta,
        group: 'Locations',
      }));
    return [...toteOptions, ...locationOptions];
  }, [locations.options, totes.data]);

  const faceOf = useCallback(
    (value: string) =>
      value.startsWith(TOTE_VALUE_PREFIX)
        ? value.slice(TOTE_VALUE_PREFIX.length)
        : (options.find((option) => option.value === value)?.label ?? skuExceptionLocationFace(value)),
    [options],
  );

  const resolve = useCallback(
    async (value: string) => {
      if (!value.startsWith(TOTE_VALUE_PREFIX)) return value;
      const res = await fetch('/api/stock-places', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tote: value.slice(TOTE_VALUE_PREFIX.length) }),
      });
      const data = (await res.json().catch(() => null)) as { barcode?: string; error?: string } | null;
      if (!res.ok || !data?.barcode) throw new Error(data?.error || `Could not use that tote (${res.status})`);
      // The tote is a location now: both lists re-read so it reads as one place.
      void queryClient.invalidateQueries({ queryKey: STOCK_TOTES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['stock-pair-locations'] });
      return data.barcode;
    },
    [queryClient],
  );

  return { options, loading: locations.loading || totes.isLoading, faceOf, resolve };
}
