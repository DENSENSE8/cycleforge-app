'use client';

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  receivingSiblingsQueryKey,
  receivingSiblingsSerialsQueryKey,
  upsertSiblingLine,
} from '@/lib/queries/receiving-queries';
import { readOptimisticFlag } from '@/lib/receiving/optimistic-serials';
import { shouldPreserveCachedSerials } from '@/lib/receiving/optimistic-return-line';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { LineSerial } from '@/lib/receiving/optimistic-serials';
import { filterLinesByPoGroup } from '@/lib/receiving/po-group-title';

export interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
}

// Stable empty array so `data?.receiving_lines ?? EMPTY_ROWS` keeps a constant
// reference while loading — prevents the `useMemo`/`layout` deps from churning
// on every render before the first fetch resolves.
const EMPTY_ROWS: ReceivingLineRow[] = [];

function hasInFlightSerial(row: ReceivingLineRow): boolean {
  return (row.serials ?? []).some(
    (s) => readOptimisticFlag(s as { _optimistic?: 'adding' | 'removing' }) != null,
  );
}

interface Args {
  receivingId: number;
  activeLineId: number;
  /**
   * Testing context only: hide lines marked needs_test=false (cables / no-test
   * items). The active line is always kept visible.
   */
  hideNoTestLines?: boolean;
  /**
   * The already-known active line — used as query `placeholderData` so the
   * clicked line paints INSTANTLY on a cold open while the full sibling list
   * fetches. Ignored once real (or cached) data is present.
   */
  placeholderActiveRow?: ReceivingLineRow;
}

export interface PoLinesData {
  /** The `['receiving-siblings', receivingId]` key — shared with the item-desc editor's optimistic cache write. */
  queryKey: ReturnType<typeof receivingSiblingsQueryKey>;
  /** Every sibling line of this carton, in original API order (unfiltered). */
  allRows: ReceivingLineRow[];
  /** `allRows` with no-test lines dropped when `hideNoTestLines` is set. */
  rows: ReceivingLineRow[];
  /**
   * Serial-unit ids across every line of this carton — the atoms an LPN box
   * groups. Drives the "Add to box" control. Empty until a serial is scanned.
   */
  cartonUnitIds: number[];
  /**
   * True while the first serial-hydration fetch is in flight (no serial data
   * cached yet). Drives the per-row {@link SerialChipSkeleton} so a line with no
   * serials *yet* reads as "loading" instead of "none". Metadata rows already
   * paint from the fast lines-only query, so only the serial slot waits.
   */
  serialsLoading: boolean;
}

/**
 * Data + cache-coordination layer for {@link PoLinesAccordion}.
 *
 * Owns the sibling-lines query (keyed by the shared carton `receiving_id`, so
 * it stays warm across line switches), the instant-paint placeholder, and the
 * two window-event bridges that keep the render deriving from a SINGLE source
 * of truth (the query cache):
 *
 * - `receiving-line-updated` → patch the matching line straight into the cache
 *   (the load-bearing flicker fix — never mirror `data` into local state; the
 *   workspace re-seeds per line, and a local mirror starts empty every seed and
 *   paints one blank frame first).
 * - `app-refresh-data` → invalidate so a remote edit reflows the sibling list.
 */
export function usePoLinesData({
  receivingId,
  activeLineId,
  hideNoTestLines = false,
  placeholderActiveRow,
}: Args): PoLinesData {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => receivingSiblingsQueryKey(receivingId), [receivingId]);
  const serialsKey = useMemo(
    () => receivingSiblingsSerialsQueryKey(receivingId),
    [receivingId],
  );
  const enabled = Number.isFinite(receivingId) && receivingId > 0;

  // Single-line placeholder so a cold open paints the clicked line immediately
  // (the full sibling list replaces it the moment the fetch resolves). Stable
  // per line id so it doesn't churn the query each render.
  const placeholderData = useMemo<ApiResponse | undefined>(
    () =>
      placeholderActiveRow && placeholderActiveRow.id > 0
        ? { success: true, receiving_lines: [placeholderActiveRow] }
        : undefined,
    [placeholderActiveRow],
  );

  // Primary query = sibling METADATA only (sku / price / condition / qty), no
  // serials — so every sibling row paints without waiting on the heavy serial
  // resolution. Serials are overlaid onto THIS cache by the hydration query
  // below, keeping `row.serials` the single SoT every consumer reads.
  const { data } = useQuery<ApiResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}`);
      if (!res.ok) throw new Error('Failed to fetch siblings');
      const fresh: ApiResponse = await res.json();
      // Never blank serials on a metadata refetch: carry forward anything
      // already known — optimistic scans + prior hydration live on this cache;
      // the serials query's own cache covers a "serials resolved first" race.
      const prevSerials = new Map<number, ReceivingLineRow['serials']>();
      for (const r of queryClient.getQueryData<ApiResponse>(serialsKey)?.receiving_lines ?? []) {
        if (r.serials != null) prevSerials.set(r.id, r.serials);
      }
      for (const r of queryClient.getQueryData<ApiResponse>(queryKey)?.receiving_lines ?? []) {
        if (r.serials != null) prevSerials.set(r.id, r.serials); // main wins (holds in-flight optimistic)
      }
      if (prevSerials.size > 0) {
        fresh.receiving_lines = fresh.receiving_lines.map((r) => {
          const cached = prevSerials.get(r.id);
          // Empty `[]` from an unpopulated serial_projection is NOT authoritative
          // — treat it like null so optimistic / hydrated chips survive refetch.
          if (
            shouldPreserveCachedSerials(
              r.serials as LineSerial[] | null | undefined,
              cached as LineSerial[] | undefined,
            )
          ) {
            return { ...r, serials: cached } as ReceivingLineRow;
          }
          return r;
        });
      }
      return fresh;
    },
    enabled,
    placeholderData,
    staleTime: 15_000,
    // Do NOT refetch on window focus. The Pass+Print flow opens a print
    // popup / silent-print window, which bounces focus and would otherwise
    // refetch and wipe the optimistic verdict the operator just set. The
    // global QueryClient default is `refetchOnWindowFocus: 'always'`, so this
    // override is load-bearing for the testing workspace.
    refetchOnWindowFocus: false,
  });

  // Parallel serial hydration — the heavy `include=serials` resolution runs on
  // its own cache so the metadata query never waits for it. On resolve, overlay
  // serials onto the shared siblings cache (the single `row.serials` SoT).
  const serialsQuery = useQuery<ApiResponse>({
    queryKey: serialsKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines?receiving_id=${receivingId}&include=serials`,
      );
      if (!res.ok) throw new Error('Failed to fetch serials');
      return res.json();
    },
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  // Overlay resolved serials onto the metadata cache. Runs only when the serials
  // query's data changes (not on every metadata write), so it never re-applies
  // stale server serials over a just-confirmed optimistic scan. A row with an
  // in-flight optimistic serial is skipped — the scan path owns it until its own
  // reconcile lands.
  const serialRows = serialsQuery.data?.receiving_lines;
  useEffect(() => {
    if (!serialRows) return;
    const serialsById = new Map<number, ReceivingLineRow['serials']>(
      serialRows.map((r) => [r.id, (r.serials ?? []) as ReceivingLineRow['serials']]),
    );
    queryClient.setQueryData<ApiResponse>(queryKey, (prev) => {
      if (!prev?.receiving_lines) return prev;
      let changed = false;
      const next = prev.receiving_lines.map((r) => {
        if (!serialsById.has(r.id)) return r;
        const hasInFlight = (r.serials ?? []).some(
          (s) => readOptimisticFlag(s as { _optimistic?: 'adding' | 'removing' }) != null,
        );
        if (hasInFlight) return r;
        const incoming = serialsById.get(r.id) ?? [];
        if (r.serials === incoming) return r;
        changed = true;
        return { ...r, serials: incoming } as ReceivingLineRow;
      });
      return changed ? { ...prev, receiving_lines: next } : prev;
    });
  }, [serialRows, queryClient, queryKey]);

  // First-load only (no serial data cached yet) → drive the per-row skeleton.
  // A background refetch of already-shown serials keeps `isLoading` false, so
  // resolved serial chips never flash back to a skeleton.
  const serialsLoading = serialsQuery.isLoading;

  // Optimistic `receiving-line-updated` patches go straight into the QUERY
  // CACHE, so the render derives from a SINGLE source of truth (`data`). See
  // the hook docblock for why a `localRows` mirror flickers. Upserts when the
  // patch id is new (return-scan creates a line) so we don't wait for refetch.
  useEffect(() => {
    const handler = (event: Event) => {
      const patch = (event as CustomEvent<Partial<ReceivingLineRow>>).detail;
      if (!patch || typeof patch.id !== 'number') return;
      queryClient.setQueryData<ApiResponse>(queryKey, (prev) => {
        const base = prev?.receiving_lines ?? [];
        const existing = base.find((r) => r.id === patch.id);
        // In-flight optimistic serials: the scan path owns the row until confirm.
        if (existing && hasInFlightSerial(existing) && patch.serials != null) {
          const patchWithoutSerials = { ...patch };
          delete patchWithoutSerials.serials;
          if (Object.keys(patchWithoutSerials).length <= 1) return prev; // id only
          return {
            success: prev?.success ?? true,
            receiving_lines: base.map((r) =>
              r.id === patch.id
                ? ({ ...r, ...patchWithoutSerials, serials: r.serials } as ReceivingLineRow)
                : r,
            ),
          };
        }
        return upsertSiblingLine(prev, {
          ...(existing ?? {}),
          ...patch,
          id: patch.id,
        } as ReceivingLineRow);
      });
    };
    window.addEventListener('receiving-line-updated', handler);
    return () => window.removeEventListener('receiving-line-updated', handler);
  }, [queryClient, queryKey]);

  // After a sibling click the workspace re-seeds. Invalidate so the new
  // workspace sees fresh siblings (in case a remote actor edited one).
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey });
    window.addEventListener('app-refresh-data', handler);
    return () => window.removeEventListener('app-refresh-data', handler);
  }, [queryClient, queryKey]);

  // Single source of truth = the query cache. Original API order is preserved so
  // clicking a sibling feels like a local expand/collapse, not a "row jumps to
  // the bottom" switch. Filter to the active line's PO group so mixed-PO cartons
  // (one receiving_id, multiple Zoho POs) don't leak foreign lines into the
  // accordion. In the testing workspace, no-test lines (cables toggled off) are
  // hidden — but the active line is always kept so a mid-flow toggle never
  // blanks the workspace.
  const cartonRows = data?.receiving_lines ?? EMPTY_ROWS;
  const allRows = useMemo(() => {
    const anchor =
      cartonRows.find((r) => r.id === activeLineId) ??
      (placeholderActiveRow && placeholderActiveRow.id === activeLineId
        ? placeholderActiveRow
        : null);
    return anchor ? filterLinesByPoGroup(cartonRows, anchor) : cartonRows;
  }, [cartonRows, activeLineId, placeholderActiveRow]);
  const rows = hideNoTestLines
    ? allRows.filter((r) => r.id === activeLineId || r.needs_test !== false)
    : allRows;

  const cartonUnitIds = useMemo(
    () =>
      allRows.flatMap((r) =>
        (r.serials ?? [])
          .map((s) => s.id)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    [allRows],
  );

  return { queryKey, allRows, rows, cartonUnitIds, serialsLoading };
}
