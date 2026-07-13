'use client';

/**
 * Tier A of the immediate-serial-display plan
 * (docs/todo/receiving-serial-immediate-display-plan.md): eagerly batch-seed the
 * serials of a feed's VISIBLE cartons so a subsequent row-click opens from a warm
 * cache — instant, identical to the scan path — instead of lazily fetching
 * serials after the workspace mounts (the visible lag).
 *
 * How it stays cheap:
 *   - It only fetches for rows that DON'T ALREADY carry serials. Once Tier B2's
 *     `serial_projection` read-model is populated, every feed row arrives with
 *     `serials` natively, so this hook fires ZERO requests — it degrades to a
 *     pure fallback for the pre-backfill / drifted window, exactly as the plan
 *     sequences it ("retire reliance on Tier A's prefetch").
 *   - One batched request per feed load (not N), reusing the `?receiving_ids=…`
 *     branch of GET /api/receiving-lines.
 *
 * On resolve it patches `serials` onto BOTH the feed's own row cache (so the
 * clicked row — `placeholderActiveRow` — carries serials on frame 1) and each
 * `['receiving-siblings', id]` cache (so PoLinesAccordion mounts warm), never
 * clobbering an in-flight optimistic serial (the scan path owns those).
 */

import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import { readOptimisticFlag } from '@/lib/receiving/optimistic-serials';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

type LineSerials = NonNullable<ReceivingLineRow['serials']>;

interface BatchSerialsResponse {
  success: boolean;
  serialsByLine?: Record<string, LineSerials>;
}

/** Rows that still need serials: real line, a carton, and no serials yet. */
export function rowsNeedingSerials(rows: ReceivingLineRow[] | undefined): ReceivingLineRow[] {
  if (!rows) return [];
  return rows.filter(
    (r) =>
      typeof r.id === 'number' &&
      r.id > 0 &&
      typeof r.receiving_id === 'number' &&
      r.receiving_id > 0 &&
      r.serials == null,
  );
}

/** True when a row carries an in-flight optimistic serial the scan path owns. */
function hasInFlightSerial(row: ReceivingLineRow): boolean {
  return (row.serials ?? []).some(
    (s) => readOptimisticFlag(s as { _optimistic?: 'adding' | 'removing' }) != null,
  );
}

/** Merge a `serialsByLine` map onto a row list, skipping in-flight-optimistic rows. */
export function patchRowsWithSerials(
  rows: ReceivingLineRow[],
  serialsByLine: Record<string, LineSerials>,
): { next: ReceivingLineRow[]; changed: boolean } {
  let changed = false;
  const next = rows.map((r) => {
    const incoming = serialsByLine[String(r.id)];
    if (!incoming || hasInFlightSerial(r)) return r;
    // Only fill when the row still lacks serials — never overwrite a fresher set.
    if (r.serials != null) return r;
    changed = true;
    return { ...r, serials: incoming } as ReceivingLineRow;
  });
  return { next, changed };
}

/**
 * Batch-seed serials for the visible rows of one feed and patch them onto the
 * feed cache + the per-carton siblings caches.
 *
 * @param queryClient  the app QueryClient
 * @param rows         the feed's currently-cached rows (from its query cache)
 * @param railQueryKey the feed's own cache key — patched so the clicked row carries serials
 */
export function useHydrateVisibleSerials(
  queryClient: QueryClient,
  rows: ReceivingLineRow[] | undefined,
  railQueryKey: ReadonlyArray<unknown>,
): void {
  // Signature of the receiving_ids that still need serials — a change (new page,
  // a fresh carton scrolled in) re-arms the debounced batch fetch.
  const needy = rowsNeedingSerials(rows);
  const receivingIds = Array.from(
    new Set(needy.map((r) => r.receiving_id as number)),
  ).sort((a, b) => a - b);
  const sig = receivingIds.join(',');

  const railKeySig = JSON.stringify(railQueryKey);

  useEffect(() => {
    if (receivingIds.length === 0) return;
    let cancelled = false;
    // Debounce so a fast-scrolling feed coalesces into one batched request.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/receiving-lines?receiving_ids=${receivingIds.join(',')}`,
          );
          if (!res.ok) return;
          const data = (await res.json()) as BatchSerialsResponse;
          const serialsByLine = data.serialsByLine;
          if (cancelled || !serialsByLine || Object.keys(serialsByLine).length === 0) return;

          // 1) Patch the feed's own rows so the clicked row (placeholderActiveRow)
          //    carries serials on the first frame of the accordion.
          queryClient.setQueryData<ReceivingLineRow[]>(
            railQueryKey as unknown[],
            (prev) => {
              if (!Array.isArray(prev)) return prev;
              const { next, changed } = patchRowsWithSerials(prev, serialsByLine);
              return changed ? next : prev;
            },
          );

          // 2) Overlay onto each carton's siblings cache so PoLinesAccordion —
          //    which reads `['receiving-siblings', id]` — mounts warm.
          for (const receivingId of receivingIds) {
            queryClient.setQueryData<{ success?: boolean; receiving_lines?: ReceivingLineRow[] }>(
              receivingSiblingsQueryKey(receivingId),
              (prev) => {
                if (!prev?.receiving_lines) return prev;
                const { next, changed } = patchRowsWithSerials(prev.receiving_lines, serialsByLine);
                return changed ? { ...prev, receiving_lines: next } : prev;
              },
            );
          }
        } catch {
          /* silent — the authoritative include=serials path still reconciles */
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // sig covers the receiving_ids set; railKeySig re-arms on a feed switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, railKeySig, queryClient]);
}
