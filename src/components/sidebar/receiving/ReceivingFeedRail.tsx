'use client';

/** Generic receiving rail — binds a declarative {@link ReceivingRailFeed} to the shared {@link RecentActivityRailBase} display shell. */

import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { parseStaffParam } from '@/lib/station/table-url-params';
import { RecentActivityRailBase, type ApiResponse } from './RecentActivityRailBase';
import { useRailExclusions } from './useRailExclusions';
import { useRailRowDismiss } from './useRailRowDismiss';
import { useRailRowDelete } from './useRailRowDelete';
import { receivingShareUrl } from './receiving-sidebar-shared';
import { shareRecordLink } from '@/lib/share-link';
import { useAuth } from '@/contexts/AuthContext';
import { useRailEditMode } from '@/components/sidebar/rail-edit-mode';
import { railExclusionFeedKey } from '@/lib/receiving/rail/exclusion-feed-key';
import type { RailRowActionsResolver } from '@/components/sidebar/rail-shell/rail-row-actions';
import { buildRailRowActions } from '@/lib/receiving/rail/row-actions';
import {
  RECEIVING_RAIL_FEEDS,
  fetchReceivingLines,
  type RailFetchRuntime,
  type ReceivingRailFeedId,
} from '@/lib/receiving/rail/feeds';
import { receivingRailQueryKey } from '@/lib/receiving/rail/rail-query-key';
import { stampPoRailTitleContext } from '@/lib/receiving/po-group-title';
import { RAIL_QTY } from '@/lib/receiving/rail/quantity';
import { RAIL_STATUS } from '@/lib/receiving/rail/status';

interface ReceivingFeedRailProps {
  /** Which feed to render — the registry key (`"unboxRecent"`, `"triageCombined"`, `"testingRecent"`). */
  feed: ReceivingRailFeedId;
  selectedLineId: number | null;
  selectedRow?: ReceivingLineRow | null;
  /** Rows that are still resolving (the Unbox pending scan row) take no click / peek. */
  getRowDisabled?: (row: ReceivingLineRow) => boolean;
  emptyText?: string;
  /** Optional read-only context node under the popover badges (e.g. unfound exception dot). */
  renderPopoverContext?: (row: ReceivingLineRow) => ReactNode;
}

export function ReceivingFeedRail({
  feed: feedId,
  selectedLineId,
  selectedRow = null,
  getRowDisabled,
  emptyText,
  renderPopoverContext,
}: ReceivingFeedRailProps) {
  const feed = RECEIVING_RAIL_FEEDS[feedId];
  // Hook must run unconditionally; the value is only USED when the feed opts in.
  const searchParams = useSearchParams();
  // `?staff=` is the canonical param (P1-WORK-02); `?staffId=` survives only as
  // a read-fallback for old receiving deep-links. Writers emit `?staff=` only.
  const staffId = feed.usesStaffFilter
    ? parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'))
    : null;

  // Phase 4 read filter:
  const exclusionFeedKey = railExclusionFeedKey(feedId);
  const excluded = useRailExclusions(exclusionFeedKey);

  // Distinct, isolated cache entry per feed/staff — still under the ['receiving-lines-table'] prefix so broad invalidations reach it.
  const queryKey = useMemo(
    () => receivingRailQueryKey(feed.segment, undefined, '', staffId),
    [feed.segment, staffId],
  );

  // Fetch is exclusion-agnostic (dismissed rows are dropped at display time,
  // see `excluded` → `excludedIds` below). This only layers PO-level adaptive
  // title context onto the fetched rows when the feed opts in.
  const fetchFn = useMemo<() => Promise<ApiResponse>>(() => {
    const rt: RailFetchRuntime = { staffId };
    const baseFetchFn = feed.buildFetcher
      ? feed.buildFetcher(rt)
      : () =>
          fetchReceivingLines(
            { segment: feed.segment, view: feed.view!, sort: feed.sort, postFilter: feed.postFilter },
            rt,
          );
    if (feed.stampRailTitleContext !== 'po') return baseFetchFn;
    return async () => {
      const data = await baseFetchFn();
      const rows = stampPoRailTitleContext(data.receiving_lines ?? []);
      return { ...data, receiving_lines: rows, total: rows.length };
    };
  }, [feed, staffId]);

  const qty = RAIL_QTY[feed.qty];
  const dot = RAIL_STATUS[feed.status];

  // Per-row ⋮ menu.
  const dismissRow = useRailRowDismiss(exclusionFeedKey);
  const deleteCarton = useRailRowDelete();
  // The DELETE route enforces `receiving.mark_received`; mirror the gate here so
  // an operator without it never sees a button that can only 403.
  const { has } = useAuth();
  const canDelete = has('receiving.mark_received');
  // Bulk multi-select entry point — reads the ambient `RailEditModeProvider`
  // (mounted by the panel that owns this rail). No provider above (FBA,
  // Testing) → `enabled: false` → the verb is omitted, not offered broken.
  const editMode = useRailEditMode();
  const rowActionsId = feed.rowActions;
  const rowActions = useMemo<RailRowActionsResolver<ReceivingLineRow> | undefined>(() => {
    if (!rowActionsId) return undefined;
    return (row, ctx) => {
      const cartonId = Number(row.receiving_id);
      const hasCarton = Number.isFinite(cartonId) && cartonId > 0;
      return buildRailRowActions(rowActionsId, {
        select: editMode.enabled
          ? () => {
              if (!editMode.active) editMode.toggleActive();
              editMode.toggle(row.id);
            }
          : null,
        share: hasCarton
          ? () => void shareRecordLink(receivingShareUrl(cartonId, row.id), ctx.rowLabel)
          : null,
        hide: exclusionFeedKey ? () => void dismissRow(row.id, ctx.rowLabel) : null,
        remove: hasCarton && canDelete ? () => void deleteCarton(cartonId, ctx.rowLabel) : null,
      });
    };
  }, [rowActionsId, exclusionFeedKey, dismissRow, deleteCarton, canDelete, editMode]);

  return (
    <RecentActivityRailBase
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      getRowDisabled={getRowDisabled}
      limit={feed.limit ?? 25}
      queryKey={queryKey}
      fetchFn={fetchFn}
      excludedIds={excluded}
      updateEvent={
        feed.acceptLineUpdateBus === false ? undefined : 'receiving-line-updated'
      }
      deleteEvent={feed.listenLineDelete === false ? undefined : 'receiving-line-deleted'}
      deleteGroupEvent="receiving-entry-deleted"
      refreshDomains={feed.refreshDomains}
      // Workspace header chevrons (`LineEditToolbar`) dispatch this channel — the QC Recent rail (`testingRecent`) steps on `testing-navigate-rail`.
      navigateEvent={
        feedId === 'testingRecent' ? 'testing-navigate-rail' : 'receiving-navigate-table'
      }
      rowActions={rowActions}
      eyebrowTitle={feed.eyebrowTitle}
      emptyText={emptyText}
      pinSelectedLead={feed.pinSelectedLead}
      preserveServerOrder={feed.preserveServerOrder}
      staggerRevealMotion={feed.staggerRevealMotion}
      getActivityAt={feed.getActivityAt}
      getStatusDot={dot.getStatusDot}
      getStatusDotLabel={dot.getStatusDotLabel}
      renderQuantity={qty.renderQuantity}
      getPreviewQty={qty.getPreviewQty}
      renderPopoverContext={renderPopoverContext}
      rowTitleMode={feed.rowTitleMode}
      contentPaintSurface={feedId === 'unboxRecent' ? 'unbox:sidebar-rail' : undefined}
    />
  );
}
