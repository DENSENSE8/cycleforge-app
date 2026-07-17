'use client';

/**
 * Generic receiving rail — binds a declarative {@link ReceivingRailFeed} to the
 * shared {@link RecentActivityRailBase} display shell. This is the single piece
 * of glue every receiving-page rail flows through: it derives the query key,
 * builds the fetcher (standard or multi-source), and resolves the quantity +
 * status-dot strategies from the registries. No new display — the row anatomy,
 * popover, skeleton, grouping, and keyboard nav all live in the base shell.
 *
 * The named rail components (ReceivingRecentRail / ReceivingScannedRail /
 * ReceivingViewedRail / TriageCombinedList / TriageUnfoundList) are now thin
 * bindings around this, kept as stable seams to diverge later if a single
 * surface needs to.
 */

import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { railSnapshotFeedParam } from '@/lib/receiving/rail/rail-snapshot-cache';
import { fetchRailSnapshot, persistRailSnapshot } from '@/lib/receiving/rail/rail-snapshot-client';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { RecentActivityRailBase, type ApiResponse } from './RecentActivityRailBase';
import { useHydrateVisibleSerials } from './useHydrateVisibleSerials';
import { useRailExclusions } from './useRailExclusions';
import { railExclusionFeedKey } from '@/lib/receiving/rail/exclusion-feed-key';
import {
  RECEIVING_RAIL_FEEDS,
  fetchReceivingLines,
  type RailFetchRuntime,
  type ReceivingRailFeedId,
} from '@/lib/receiving/rail/feeds';
import { stampPoRailTitleContext } from '@/lib/receiving/po-group-title';
import { RAIL_QTY } from '@/lib/receiving/rail/quantity';
import { RAIL_STATUS } from '@/lib/receiving/rail/status';

interface ReceivingFeedRailProps {
  /** Which feed to render — the registry key (`"unboxRecent"`, `"scanned"`, …). */
  feed: ReceivingRailFeedId;
  selectedLineId: number | null;
  selectedRow?: ReceivingLineRow | null;
  /** Optimistic row pinned at the top until its real row lands (triage importing stub). */
  leadingRow?: ReceivingLineRow | null;
  getRowDisabled?: (row: ReceivingLineRow) => boolean;
  /**
   * Cache scope for feeds that mount in more than one mode (the Scanned feed is
   * the unbox Queue AND the triage Prioritize) — keeps each mode's cache entry
   * distinct so one mode's in-flight/stale rows can't flash into the other.
   */
  scope?: string;
  /** Desktop search text (filters the feed's rows). */
  filterText?: string;
  /** Hide the TITLE · N eyebrow when workbench chrome owns tabs + select. */
  hideEyebrow?: boolean;
  emptyText?: string;
  /** Optional read-only context node under the popover badges (e.g. unfound exception dot). */
  renderPopoverContext?: (row: ReceivingLineRow) => ReactNode;
  /** Optional popover footer action, left of "Open →" (e.g. unfound "Claim"). */
  renderPopoverActions?: (row: ReceivingLineRow, ctx: { dismiss: () => void }) => ReactNode;
}

export function ReceivingFeedRail({
  feed: feedId,
  selectedLineId,
  selectedRow = null,
  leadingRow = null,
  getRowDisabled,
  scope,
  filterText = '',
  hideEyebrow = false,
  emptyText,
  renderPopoverContext,
  renderPopoverActions,
}: ReceivingFeedRailProps) {
  const feed = RECEIVING_RAIL_FEEDS[feedId];
  // Hook must run unconditionally; the value is only USED when the feed opts in.
  const searchParams = useSearchParams();
  // `?staff=` is the canonical param (P1-WORK-02); `?staffId=` survives only as
  // a read-fallback for old receiving deep-links. Writers emit `?staff=` only.
  const staffId = feed.usesStaffFilter
    ? parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'))
    : null;
  const q = filterText.trim().toLowerCase();

  // Phase 4 read filter: this staffer's dismissed rows for the feed
  // (staff_rail_exclusions, keyed by rail id = row.id). Applied as a client-side
  // DISPLAY filter (`excludedIds` on the rail), NOT baked into the queryKey —
  // baking it in meant that when the async exclusion fetch resolved (or a dismiss
  // invalidated it), the signature changed, the queryKey changed, and the rail
  // blanked to a skeleton then refetched. Filtering in place keeps the list up.
  const exclusionFeedKey = railExclusionFeedKey(feedId, scope);
  const excluded = useRailExclusions(exclusionFeedKey);

  // Distinct, isolated cache entry per feed/scope/staff/query — still under the
  // ['receiving-lines-table'] prefix so broad invalidations refresh it.
  const queryKey = useMemo(
    () =>
      ['receiving-lines-table', 'rail', feed.segment, scope ?? 'default', q, staffId ?? 'all'] as const,
    [feed.segment, scope, q, staffId],
  );

  const rt: RailFetchRuntime = { staffId, query: q };
  const baseFetchFn = feed.buildFetcher
    ? feed.buildFetcher(rt)
    : () =>
        fetchReceivingLines(
          { segment: feed.segment, view: feed.view!, sort: feed.sort, postFilter: feed.postFilter },
          rt,
        );

  // Fetch is exclusion-agnostic now (dismissed rows are dropped at display time,
  // see `excluded` → `excludedIds` below). This only layers PO-level adaptive
  // title context onto the fetched rows when the feed opts in.
  const fetchFn = useMemo<() => Promise<ApiResponse>>(() => {
    if (feed.stampRailTitleContext !== 'po') return baseFetchFn;
    return async () => {
      const data = await baseFetchFn();
      const rows = stampPoRailTitleContext(data.receiving_lines ?? []);
      return { ...data, receiving_lines: rows, total: rows.length };
    };
    // baseFetchFn is rebuilt each render from rt (staffId/query); the stable
    // inputs below track a real fetch-shape change (baseFetchFn itself is
    // intentionally omitted — it has a new identity every render).
  }, [feed.segment, feed.stampRailTitleContext, scope, q, staffId]);

  // Cold-reload continuity: seed this rail's first paint from its last-known
  // rows in Upstash (org + viewer scoped server-side), and persist the rows it
  // renders for next time. Seed-only — the authoritative fetch reconciles over
  // it. Only the UNFILTERED view seeds/persists (a searched rail is transient).
  // feedParam is fully client-composed so read/write keys can't drift.
  const snapshotFeedParam = useMemo(
    () => (q === '' ? railSnapshotFeedParam({ feedId, scope, staffFilterId: staffId }) : null),
    [q, feedId, scope, staffId],
  );
  const loadSnapshot = useMemo(
    () => (snapshotFeedParam ? () => fetchRailSnapshot(snapshotFeedParam) : undefined),
    [snapshotFeedParam],
  );
  const persistSnapshot = useMemo(
    () => (snapshotFeedParam
      ? (rows: ReceivingLineRow[]) => persistRailSnapshot(snapshotFeedParam, rows)
      : undefined),
    [snapshotFeedParam],
  );

  const qty = RAIL_QTY[feed.qty];
  const dot = RAIL_STATUS[feed.status];

  // Tier A serial pre-seed: read-only observer of the rail cache the base owns
  // (enabled:false → never fetches), so we can hand the visible rows to the
  // batch-serial hydrator. It only fires for rows still lacking serials, so once
  // Tier B2's projection is populated every row arrives with serials and this is
  // a pure no-op.
  const queryClient = useQueryClient();
  const railRows = useQuery<ReceivingLineRow[]>({
    queryKey,
    queryFn: async () => [],
    enabled: false,
    notifyOnChangeProps: ['data'],
  }).data;
  useHydrateVisibleSerials(queryClient, railRows, queryKey);

  return (
    <RecentActivityRailBase
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      leadingRow={leadingRow}
      getRowDisabled={getRowDisabled}
      limit={feed.limit ?? 25}
      queryKey={queryKey}
      fetchFn={fetchFn}
      excludedIds={excluded}
      loadSnapshot={loadSnapshot}
      persistSnapshot={persistSnapshot}
      updateEvent="receiving-line-updated"
      deleteEvent={feed.listenLineDelete === false ? undefined : 'receiving-line-deleted'}
      deleteGroupEvent="receiving-entry-deleted"
      refreshEvents={feed.refreshEvents}
      // Workspace header chevrons (`LineEditToolbar`) dispatch this channel —
      // same contract as TestingRecentRail ↔ testing-navigate-rail. Without it
      // unbox/triage prev/next are a no-op (the history table listens on the
      // same name but its rows aren't the rail's PO list).
      navigateEvent="receiving-navigate-table"
      eyebrowTitle={feed.eyebrowTitle}
      hideEyebrow={hideEyebrow}
      emptyText={emptyText}
      autoSelectFirstWhenEmpty={feed.autoSelectFirstWhenEmpty}
      pinSelectedLead={feed.pinSelectedLead}
      staggerRevealMotion={feed.staggerRevealMotion}
      getActivityAt={feed.getActivityAt}
      getStatusDot={dot.getStatusDot}
      getStatusDotLabel={dot.getStatusDotLabel}
      renderQuantity={qty.renderQuantity}
      previewQtyLabel={qty.previewQtyLabel}
      getPreviewQty={qty.getPreviewQty}
      renderPopoverContext={renderPopoverContext}
      renderPopoverActions={renderPopoverActions}
      rowTitleMode={feed.rowTitleMode}
    />
  );
}
