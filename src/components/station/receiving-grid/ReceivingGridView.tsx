'use client';

import { useMemo, type RefObject } from 'react';
import { LedgerGridSurface, useGridColumnVisibility } from '@/design-system/components/grid';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { TableId } from '@/lib/tables/table-columns';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import {
  poGroupAnchorMs,
  RECEIVING_SELECTION_SCOPE,
  type ReceivingActivityAxis,
  type ReceivingPoGroup,
} from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { compareReceivingGridRows } from '@/lib/receiving/receiving-grid-compare';
import {
  RECEIVING_GRID_COLUMNS,
  defaultDirForReceivingGridSort,
  isReceivingGridSortable,
  type ReceivingGridColumn,
  type ReceivingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import { receivingStageColumnLabel } from '@/components/dashboard/queue-table/queue-table-chrome';
import { makeReceivingGridDescriptor } from './receiving-grid-descriptor';
import { ReceivingGridColumnHeader } from './ReceivingGridColumnHeader';
import { ReceivingGridGroupRow } from './ReceivingGridGroupRow';

interface ReceivingGridViewProps {
  /** Day-banded PO groups (Unbox / History). */
  filteredGroupedRecords?: Record<string, ReceivingPoGroup[]>;
  /**
   * Flat day sections (Testing History). Converted to singleton groups.
   * Mutually exclusive with `filteredGroupedRecords` in practice.
   */
  daySections?: [string, ReceivingLineRow[]][];
  /** Keep server ORDER BY when true (until a column sort is active). */
  serverSorted?: boolean;
  loading: boolean;
  emptyMessage: string;
  isMobile: boolean;
  selectMode: boolean;
  selectedId: number | null;
  selectedIds: Set<number>;
  handleSelectRow: (row: ReceivingLineRow) => void;
  handleSelectGroup: (ids: readonly number[]) => void;
  /** Stage clock axis — drives column header + cell stamps. */
  activityAxis?: ReceivingActivityAxis;
  /** History reads status dots as uniform received-green. */
  isHistory?: boolean;
  /** Override stage header label (e.g. Testing History → "Tested"). */
  stageLabel?: string;
  /** Selection bus scope (defaults to receiving). */
  selectionScope?: string;
  /** FULL canonical column list — visibility is resolved here, not by callers. */
  columns?: readonly ReceivingGridColumn[];
  /**
   * Staff-prefs identity for per-staff column config. Unbox / History are
   * `receiving`; Testing History passes `testing` so the two keep independent
   * Fields selections.
   */
  tableId?: TableId;
  /** Show sticky day-band headers. Default false — Date is a per-row column
   * (Pending / Incoming recipe). Testing History may opt back in. */
  showDayHeaders?: boolean;
  /** Mirror of LedgerGrid scroll body for keyboard-nav / page scroll-to-top. */
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /** Testid on the outer card shell. */
  testId?: string;
}

function poFoldKey(row: ReceivingLineRow): string {
  const po = (row.zoho_purchaseorder_id || row.zoho_purchaseorder_number || '').trim();
  return po || `line:${row.id}`;
}

/**
 * Unbox / History / Testing spreadsheet — receiving-domain adapter over
 * {@link LedgerGrid}. Same shell recipe as {@link IncomingGridView} / Pending
 * (airtable skin + scrollX + click-to-sort), with stage + serial columns.
 */
export function ReceivingGridView({
  filteredGroupedRecords,
  daySections,
  serverSorted = false,
  loading,
  emptyMessage,
  isMobile,
  selectMode,
  selectedId,
  selectedIds,
  handleSelectRow,
  handleSelectGroup,
  activityAxis = 'unboxed',
  isHistory = false,
  stageLabel,
  selectionScope = RECEIVING_SELECTION_SCOPE,
  columns = RECEIVING_GRID_COLUMNS,
  tableId = 'receiving',
  showDayHeaders = false,
  scrollRef,
  className,
  testId = 'receiving-grid-body',
}: ReceivingGridViewProps) {
  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law),
  // so a reload or a shared link reproduces the operator's view. Mode switches
  // clear it via the route's param spec. TanStack still owns the asc↔desc cycle.
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<ReceivingGridColumnKey>({
    isColumn: isReceivingGridSortable,
    defaultDir: defaultDirForReceivingGridSort,
  });

  const resolvedStageLabel = stageLabel ?? receivingStageColumnLabel(activityAxis);

  // ONE visibility resolution: descriptor default tier + this staffer's delta.
  // Header, rows, group summaries and the grid template all read `visible` —
  // a hidden column loses its TRACK rather than rendering an empty ruled cell.
  const { columns: visible } = useGridColumnVisibility<ReceivingGridColumn>({
    columns,
    tableId,
  });

  const descriptor = useMemo(() => makeReceivingGridDescriptor(visible), [visible]);

  const { orderGroupsByDate, flatRows } = useMemo(() => {
    const flatFromGroups = filteredGroupedRecords
      ? Object.values(filteredGroupedRecords).flatMap((day) => day.flatMap((g) => g.rows))
      : [];
    const flatFromDays = daySections ? daySections.flatMap(([, rows]) => rows) : [];
    const flat = flatFromGroups.length > 0 ? flatFromGroups : flatFromDays;

    if (columnSort && sortDir) {
      const sorted = [...flat].sort((a, b) =>
        compareReceivingGridRows(a, b, columnSort, sortDir, activityAxis),
      );
      const groups = groupRowsBy(sorted, poFoldKey);
      return {
        orderGroupsByDate: [['', groups]] as [string, RowGroup<ReceivingLineRow>[]][],
        flatRows: sorted,
      };
    }

    if (filteredGroupedRecords) {
      const banded: [string, RowGroup<ReceivingLineRow>[]][] = Object.entries(filteredGroupedRecords)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, dayGroups]) => {
          const sorted = serverSorted
            ? dayGroups
            : [...dayGroups].sort((a, b) => poGroupAnchorMs(b) - poGroupAnchorMs(a));
          return [date, sorted];
        });
      return { orderGroupsByDate: banded, flatRows: flat };
    }

    if (daySections) {
      const banded: [string, RowGroup<ReceivingLineRow>[]][] = daySections.map(([date, rows]) => [
        date,
        rows.map((row) => ({ key: `k:${row.id}`, rows: [row] })),
      ]);
      return { orderGroupsByDate: banded, flatRows: flat };
    }

    return { orderGroupsByDate: [] as [string, RowGroup<ReceivingLineRow>[]][], flatRows: flat };
  }, [filteredGroupedRecords, daySections, serverSorted, columnSort, sortDir, activityAxis]);

  return (
    <LedgerGridSurface<ReceivingLineRow, ReceivingGridColumnKey>
      ariaLabel="Receiving carton lines"
      descriptor={descriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={flatRows}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      showDayHeaders={showDayHeaders}
      scrollRef={scrollRef}
      className={className}
      testId={testId}
      renderColumnHeader={({ toggleColumnSort }) => (
        <ReceivingGridColumnHeader
          isMobile={isMobile}
          selectMode={selectMode}
          selectionScope={selectionScope}
          columns={visible}
          stageLabel={resolvedStageLabel}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
        />
      )}
      renderGroup={(group, baseStripeIndex) => (
        <ReceivingGridGroupRow
          group={group}
          baseStripeIndex={baseStripeIndex}
          isMobile={isMobile}
          selectMode={selectMode}
          selectedId={selectedId}
          selectedIds={selectedIds}
          handleSelectRow={handleSelectRow}
          handleSelectGroup={handleSelectGroup}
          activityAxis={activityAxis}
          isHistory={isHistory}
          columns={visible}
        />
      )}
      renderRow={(row, stripeIndex) => (
        <ReceivingGridGroupRow
          group={{ key: `k:${row.id}`, rows: [row] }}
          baseStripeIndex={stripeIndex}
          isMobile={isMobile}
          selectMode={selectMode}
          selectedId={selectedId}
          selectedIds={selectedIds}
          handleSelectRow={handleSelectRow}
          handleSelectGroup={handleSelectGroup}
          activityAxis={activityAxis}
          isHistory={isHistory}
          columns={visible}
        />
      )}
    />
  );
}
