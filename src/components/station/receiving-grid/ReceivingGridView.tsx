'use client';

import { useCallback, useMemo, useState, type RefObject } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
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
  type ReceivingGridColumn,
  type ReceivingGridColumnKey,
  type ReceivingGridSortDir,
} from '@/lib/receiving/receiving-grid-layout';
import { receivingStageColumnLabel } from '@/components/dashboard/queue-table/queue-table-chrome';
import {
  RECEIVING_GRID_DESCRIPTOR,
  makeReceivingGridDescriptor,
} from './receiving-grid-descriptor';
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
  columns?: readonly ReceivingGridColumn[];
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
  showDayHeaders = false,
  scrollRef,
  className,
  testId = 'receiving-grid-body',
}: ReceivingGridViewProps) {
  // Ephemeral column sort (throwaway view state; server/mode order is the
  // durable default). TanStack owns the toggle cycle via LedgerGridSurface.
  const [columnSort, setColumnSort] = useState<ReceivingGridColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<ReceivingGridSortDir | null>(null);
  const handleSortChange = useCallback((key: ReceivingGridColumnKey, dir: ReceivingGridSortDir) => {
    setColumnSort(key);
    setSortDir(dir);
  }, []);

  const resolvedStageLabel = stageLabel ?? receivingStageColumnLabel(activityAxis);

  const descriptor = useMemo(
    () =>
      columns === RECEIVING_GRID_COLUMNS
        ? RECEIVING_GRID_DESCRIPTOR
        : makeReceivingGridDescriptor(columns),
    [columns],
  );

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
      descriptor={descriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={flatRows}
      sort={columnSort}
      dir={sortDir}
      onSortChange={handleSortChange}
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
          columns={columns}
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
          columns={columns}
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
          columns={columns}
        />
      )}
    />
  );
}
