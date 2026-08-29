'use client';

/**
 * The Unbox / Arrival bench's connected history dock — the lines this bench just
 * received, newest first.
 *
 * ## One fetcher, one cache key
 *
 * It builds its query through `receivingRailQueryKey` + the same
 * `RECEIVING_RAIL_FEEDS` entry the recent RAIL uses, so when both are mounted
 * they share a single react-query cache entry rather than fetching the same
 * rows twice. That matters here more than elsewhere: `/unbox` is one of the five
 * routes whose LCP is being worked on, and a second always-on request on it
 * would be a measurable regression, not a rounding error
 * (`docs/todo/one-sheet-table-sot-PLAN.md` § 7.7).
 *
 * The limit is deliberately small. A dock answers "did the last few land?", and
 * the History tab — one click away in the bottom strip — answers "what did we
 * do all week". Fetching a week's rows to show twelve of them would put the
 * cost of the second question on every load of the first.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RECEIVING_RAIL_FEEDS,
  fetchReceivingLines,
  type ReceivingRailFeedId,
} from '@/lib/receiving/rail/feeds';
import { receivingRailQueryKey } from '@/lib/receiving/rail/rail-query-key';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  StationHistoryDock,
  StationHistoryDockRow,
} from '@/components/station/StationHistoryDock';
import { useReceivingStationDockEntries } from '@/components/station/station-history-dock-feeds';

/**
 * Rows the dock asks for — and, critically, the number it FETCHES.
 *
 * This was 25 sliced client-side out of the feed's default page of 50, which
 * `npm run perf:requests --route=/unbox` caught immediately: **154.5KB in
 * 2187ms**, the single heaviest request on the route, to render twelve
 * truncated identifiers. A `ReceivingLineRow` is a fat record — photos,
 * serials, rail title context — so every row not shown is pure waste.
 *
 * Twelve is what fits the dock without scrolling. An operator asking "did the
 * last few land?" is not reading to the bottom; the History tab, one click away
 * in the bottom strip, is where "what did we do all week" lives.
 */
const DOCK_LIMIT = 12;

export function UnboxHistoryDock({
  station = 'Unbox',
  feed = 'unboxRecent',
  scope = 'unbox',
}: {
  station?: string;
  feed?: ReceivingRailFeedId;
  scope?: string;
}) {
  const config = RECEIVING_RAIL_FEEDS[feed];
  // The key carries the dock's scope, so its narrower page can never overwrite
  // the rail's wider one in the shared cache — the two ask different questions
  // of the same endpoint and must not answer each other.
  const queryKey = useMemo(
    () => receivingRailQueryKey(config.segment, `${scope}:dock`, '', null),
    [config.segment, scope],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const rt = { staffId: undefined, query: '' };
      const res = config.buildFetcher
        // Headroom over `DOCK_LIMIT`: the unboxed feed dedups by carton, so N
        // lines can collapse to fewer rows. Twice the draw is enough for a
        // glance and still less than a third of the rail's page.
        ? await config.buildFetcher(rt, { limit: DOCK_LIMIT * 2 })()
        : await fetchReceivingLines(
            {
              segment: config.segment,
              view: config.view!,
              sort: config.sort,
              postFilter: config.postFilter,
            },
            rt,
            // Ask for exactly what the dock draws. `includeSerials: false` is the
            // default and is restated here because a serial join on a glance
            // that never shows one is the same waste one field down.
            { limit: DOCK_LIMIT, includeSerials: false },
          );
      return (res.receiving_lines ?? []) as ReceivingLineRow[];
    },
    // A bench glance, not a live tail: the scan that just landed invalidates
    // this key through the station's own mutation path, so polling would only
    // re-ask a question already answered.
    staleTime: 30_000,
  });

  const entries = useReceivingStationDockEntries(
    useMemo(
      () =>
        (data ?? []).slice(0, DOCK_LIMIT).map((row) => ({
          id: row.id,
          // `unbox_opened_at` is what this feed orders by; fall back down the
          // same chain the rail's recency sort uses so a row is never timeless.
          received_at: row.unbox_opened_at ?? row.received_at ?? null,
          created_at: row.created_at ?? null,
          // The SKU is what is printed on the thing in the operator's hand.
          item_number: row.sku ?? null,
          // Catalog title first — the PO line's `item_name` is a per-receipt
          // listing string, not the product's name (see the row type's note).
          product_title:
            row.catalog_product_title ?? row.zoho_item_title ?? row.item_name ?? null,
          po_number: row.zoho_reference_number ?? null,
          quantity: row.quantity_received ?? null,
        })),
      [data],
    ),
  );

  return (
    <StationHistoryDock
      station={station}
      count={entries.length}
      loading={isLoading}
      emptyMessage="Nothing received on this bench yet."
    >
      {entries.length > 0
        ? entries.map((entry) => (
            <StationHistoryDockRow
              key={entry.key}
              time={entry.time}
              identifier={entry.identifier}
              meta={entry.meta}
            />
          ))
        : null}
    </StationHistoryDock>
  );
}
