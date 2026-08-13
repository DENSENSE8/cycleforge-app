'use client';

import { useRef, type ReactNode, type RefObject } from 'react';
import { sectionLabel, SkeletonList } from '@/design-system';
import { Button } from '@/design-system/primitives';
import { Loader2 } from '@/components/Icons';
import DateRangeHeader from '@/components/ui/DateRangeHeader';
import { OrderSearchEmptyState } from '@/components/dashboard/OrderSearchEmptyState';
import { QueueTableBanner } from '@/components/dashboard/orders-queue/QueueTableBanner';
import {
  LedgerGrid,
  type GridSurfaceCapabilities,
} from '@/design-system/components/grid';
import type { WeekRange } from '@/components/dashboard/orders-queue/helpers';
import type { RowGroup } from '@/lib/group-rows';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

/**
 * `StationListTable<TRecord>` — day-banded station/history list shell.
 * Always composes the Workbench spreadsheet SoT {@link LedgerGrid}
 * (sticky day headers + {@link VirtualGroupedSections}). The retired dense
 * `role="grid"` fallback and `StationRowColumnHeader` guide are gone.
 * Sibling of outbound {@link OrdersGridHost}: week/banner chrome stays here;
 * row + grouping are injected (`renderRow` / `renderGroup`).
 */
export interface StationListTableProps<TRecord> {
  loading: boolean;
  isRefreshing?: boolean;

  /** Grouped mode: date bands → folded order groups (pass `renderGroup`). */
  orderGroupsByDate?: [string, RowGroup<TRecord>[]][];
  /** Flat mode: date bands → rows (testing history, station logs). */
  daySections?: [string, TRecord[]][];
  /** Count shown in the header (dated, visible records). */
  totalCount: number;

  /** Render one row at the given zebra-stripe index. `rowIndex` (virtualized
   *  path only) is the absolute index inside the grid's `role="table"`. */
  renderRow: (record: TRecord, stripeIndex: number, rowIndex?: number) => ReactNode;
  /** Grouped mode: render one order group (singleton/multi-product fold). */
  renderGroup?: (group: RowGroup<TRecord>, baseStripeIndex: number) => ReactNode;
  /** Stable key for a flat row (id) so windowing survives re-sorts. */
  getRowKey?: (record: TRecord, dayIndex: number) => string;

  // Week controls (optional — testing/tech/packer/receiving history).
  weekRange?: WeekRange;
  weekOffset?: number;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onResetWeek?: () => void;
  showWeekControls?: boolean;

  // Header band.
  hideHeader?: boolean;
  /** Column-config button, rendered in the header's `columns` slot. */
  headerColumnsSlot?: ReactNode;
  /** Pipeline/All toggle + ⋮ menu, rendered on the header's right. */
  headerEndSlot?: ReactNode;
  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerCompact?: boolean;

  /**
   * The mounting surface's declared capabilities — required, never defaulted.
   *
   * This shell mounts `LedgerGrid` on behalf of whoever renders it, so without a
   * declared bag the surface underneath is unclassified: it reaches the
   * Workbench spreadsheet SoT with no answer to "what may this grid do".
   * Required is what makes a new station bench answer that rather than inherit
   * a neighbour's feature set by accident.
   */
  capabilities: GridSurfaceCapabilities;
  /** Multi-select mode — reserved for a future factory header. */
  selectMode?: boolean;

  // Body sizing / virtualization.
  /** @deprecated Always virtualized via LedgerGrid. Kept so call sites compile. */
  virtualized?: boolean;
  /** Stacked SwimlaneBoard lane: window against this shared ancestor scroll region. */
  scrollParentRef?: RefObject<HTMLElement | null>;
  autoHeight?: boolean;
  maxBodyHeightClass?: string;
  maxBodyHeightPx?: number;
  growToContent?: boolean;
  noHorizontalScroll?: boolean;
  /** Scroll a row (by its `getRowKey` value) into view — deep-link / keyboard focus. */
  scrollToKey?: string | null;

  // Empty / search.
  searchValue?: string;
  onClearSearch?: () => void;
  emptyMessage: string;
  /**
   * Accessible name for the virtualized table. Optional here (unlike the other
   * grid composers) because this shell is wrapped by generic station adapters —
   * it falls back to `bannerTitle`, which is already the surface's human label.
   */
  ariaLabel?: string;
  /** Typed first-run empty (zero rows, no search) — teaches instead of faint text. */
  firstRunEmpty?: ReactNode;
  searchEmptyTitle?: string;
  searchResultLabel?: string;
  clearSearchLabel?: string;

  footer?: ReactNode;
}

export function StationListTable<TRecord>({
  loading,
  isRefreshing = false,
  orderGroupsByDate,
  daySections,
  totalCount,
  renderRow,
  renderGroup,
  getRowKey,
  weekRange,
  weekOffset = 0,
  onPrevWeek,
  onNextWeek,
  onResetWeek,
  showWeekControls = false,
  hideHeader = false,
  headerColumnsSlot,
  headerEndSlot,
  bannerTitle,
  bannerSubtitle,
  bannerCompact = false,
  scrollParentRef,
  autoHeight = false,
  maxBodyHeightClass,
  maxBodyHeightPx,
  growToContent = false,
  noHorizontalScroll = false,
  scrollToKey,
  searchValue = '',
  onClearSearch,
  emptyMessage,
  ariaLabel,
  firstRunEmpty,
  searchEmptyTitle = 'Not found',
  searchResultLabel = 'records',
  clearSearchLabel = 'Show all',
  footer,
  capabilities,
}: StationListTableProps<TRecord>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allowHorizontalScroll = !noHorizontalScroll;

  // Body class logic mirrors OrdersGridHost / LedgerGrid scroll scaffolds.
  // X triage bar lives on {@link TableStickyXScroll} / LedgerGrid sticky gutter —
  // the body port keeps `no-scrollbar` and only owns Y (plus clipped X when off).
  const rootClass = autoHeight
    ? 'flex min-w-0 w-full bg-surface-card relative'
    : 'flex h-full min-w-0 flex-1 bg-surface-card relative';
  const columnClass = autoHeight ? 'flex flex-col w-full min-w-0' : 'flex-1 flex flex-col overflow-hidden';
  const bodyScrollClass = autoHeight
    ? growToContent
      ? 'overflow-x-clip w-full'
      : `overflow-y-auto no-scrollbar w-full ${maxBodyHeightPx == null ? maxBodyHeightClass ?? '' : ''}`
    : 'flex-1 overflow-y-auto no-scrollbar w-full';
  const bodyScrollStyle =
    autoHeight && !growToContent && maxBodyHeightPx != null ? { maxHeight: maxBodyHeightPx } : undefined;
  const emptyPadClass = autoHeight ? 'py-10' : 'py-40';

  const dayBands = orderGroupsByDate ?? daySections ?? [];
  const isEmpty = dayBands.length === 0;
  void capabilities;

  if (loading) {
    return (
      <div className={autoHeight ? 'flex flex-col bg-surface-canvas' : 'flex-1 flex flex-col bg-surface-canvas overflow-hidden'}>
        {hideHeader ? null : bannerTitle ? (
          <QueueTableBanner title={bannerTitle} subtitle={bannerSubtitle} compact={bannerCompact} />
        ) : (
          <div className={cn(PRIMARY_CHROME_ROW_FACE, 'flex items-center border-b border-border-hairline bg-surface-card px-4')}>
            <div className="h-4 w-32 bg-surface-sunken rounded animate-pulse" />
          </div>
        )}
        <div
          className={autoHeight ? `overflow-y-auto no-scrollbar ${maxBodyHeightPx == null ? maxBodyHeightClass ?? '' : ''}` : 'flex-1 overflow-y-auto no-scrollbar'}
          style={bodyScrollStyle}
        >
          <SkeletonList count={autoHeight ? 6 : 12} />
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <div className={columnClass}>
        {hideHeader ? null : bannerTitle ? (
          <QueueTableBanner title={bannerTitle} subtitle={bannerSubtitle} compact={bannerCompact} isRefreshing={isRefreshing} />
        ) : (
          <DateRangeHeader
            count={totalCount}
            columns={headerColumnsSlot}
            weekRange={weekRange}
            weekOffset={weekOffset}
            onPrevWeek={onPrevWeek}
            onNextWeek={onNextWeek}
            rightSlot={
              headerEndSlot ?? (!showWeekControls ? (
                <div className="min-w-[18px] flex items-center justify-end">
                  {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" /> : null}
                </div>
              ) : undefined)
            }
          />
        )}

        {isEmpty ? (
          <div ref={scrollRef} data-testid="column-table-body" className={bodyScrollClass} style={bodyScrollStyle}>
            <div className={`flex flex-col items-center justify-center ${emptyPadClass} text-center`}>
              {searchValue ? (
                <OrderSearchEmptyState
                  query={searchValue}
                  title={searchEmptyTitle}
                  resultLabel={searchResultLabel}
                  clearLabel={clearSearchLabel}
                  onClear={onClearSearch ?? (() => {})}
                />
              ) : firstRunEmpty ? (
                <div className="mx-auto animate-in fade-in zoom-in duration-300">{firstRunEmpty}</div>
              ) : (
                <div className="max-w-xs mx-auto animate-in fade-in zoom-in duration-300">
                  <p className="text-text-soft font-semibold italic opacity-20">{emptyMessage}</p>
                  {showWeekControls && weekOffset > 0 && onResetWeek ? (
                    <Button
                      type="button"
                      variant="brand"
                      onClick={onResetWeek}
                      className={`mt-4 bg-none bg-surface-inverse px-6 ${sectionLabel} text-white hover:bg-surface-inverse-hover`}
                    >
                      Go to Current Week
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : (
          <LedgerGrid<TRecord>
            orderGroupsByDate={orderGroupsByDate}
            daySections={daySections}
            showDayHeaders
            scrollX={allowHorizontalScroll}
            aria-label={ariaLabel ?? bannerTitle}
            columnHeader={null}
            renderRow={renderRow}
            renderGroup={renderGroup}
            getRowKey={getRowKey}
            scrollToKey={scrollToKey}
            scrollParentRef={scrollParentRef}
            bodyRef={scrollRef}
            emptyState={null}
            className={cn(autoHeight && bodyScrollClass)}
            data-testid="column-table-body"
          />
        )}
        {footer}
      </div>
    </div>
  );
}
