'use client';

/** The warehouse's BARCODED locations, as `SearchableSelectField` options. */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatStagedLocationFace } from '@/lib/receiving/recent-staged-location';

/** What `GET /api/locations` hands back, narrowed to what the picker paints. */
interface LocationOptionRow {
  id: number;
  name: string;
  room: string | null;
  barcode: string | null;
  row_label: string | null;
  col_label: string | null;
}

export interface LocationPickerOption {
  /** The BARCODE — what both write endpoints take as their path segment. */
  value: string;
  label: string;
  meta?: string;
}

export const LOCATION_PICKER_QUERY_KEY = ['stock-pair-locations'] as const;

export function useLocationPickerOptions(): {
  options: readonly LocationPickerOption[];
  loading: boolean;
} {
  const { data: locations = [], isLoading } = useQuery<LocationOptionRow[]>({
    queryKey: LOCATION_PICKER_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/locations', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load locations');
      const json = (await res.json()) as { locations?: LocationOptionRow[] };
      return json.locations ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const options = useMemo(
    () =>
      locations
        .filter((loc) => (loc.barcode ?? '').trim().length > 0)
        .map((loc) => {
          const room = (loc.room ?? '').trim();
          const name = (loc.name ?? '').trim();
          const face =
            formatStagedLocationFace({
              name: loc.name,
              barcode: loc.barcode,
              room: loc.room,
              rowLabel: loc.row_label,
              colLabel: loc.col_label,
            }) || `#${loc.id}`;
          return {
            value: loc.barcode as string,
            label: face,
            /** Room AND the bin's own name, because the meta line is the combobox's second SEARCH target (`defaultFilter` matches label ∪ meta) and the… */
            meta: [room, name !== face ? name : ''].filter(Boolean).join(' · ') || undefined,
          };
        }),
    [locations],
  );

  return { options, loading: isLoading };
}
