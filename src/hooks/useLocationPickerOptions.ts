'use client';

/**
 * The warehouse's BARCODED locations, as `SearchableSelectField` options.
 *
 * Every hand-picked location that feeds a bin write offers this one list with
 * one face — the SKU-exceptions editor's "Add to location" and the outbound
 * ledger editors — because the writes land on `PATCH /api/locations/[barcode]`.
 *
 * ## Barcodes only, and that is a write constraint
 *
 * The bin endpoints resolve their location through `getLocationByBarcode`, so a
 * location with no barcode is not addressable: offering one would be a row that
 * fails on commit.
 *
 * The face is the house coalesce ({@link formatStagedLocationFace}) so a bin
 * reads here exactly as it does at the station that scanned it, and the ROOM
 * rides the meta line — which is what an operator disambiguates two similar
 * codes by.
 *
 * One `queryKey` for every caller, so a second picker is a cache hit rather
 * than a second fetch of the same rows.
 */

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
            /**
             * Room AND the bin's own name, because the meta line is the
             * combobox's second SEARCH target (`defaultFilter` matches label ∪
             * meta) and the label is the house face — which is the BARCODE
             * whenever a bin has one (`formatStagedLocationFace`).
             *
             * Without the name here, an operator reading `C-04-11-1` off the
             * row below and typing it got "No matching location" while the
             * bin was right there under `C0411100`. Both handles reach the
             * same row now, and the room still disambiguates two similar
             * codes.
             */
            meta: [room, name !== face ? name : ''].filter(Boolean).join(' · ') || undefined,
          };
        }),
    [locations],
  );

  return { options, loading: isLoading };
}
