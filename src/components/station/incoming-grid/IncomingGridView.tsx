'use client';

import { useCallback, useMemo, useState, type RefObject } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import {
  poGroupAnchorMs,
  RECEIVING_SELECTION_SCOPE,
  type ReceivingPoGroup,
} from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import {
  type IncomingGridColumnKey,
  type IncomingGridSortDir,
} from '@/lib/receiving/incoming-grid-layout';
import { INCOMING_GRID_DESCRIPTOR } from './incoming-grid-descriptor';
import { IncomingGridColumnHeader } from './IncomingGridColumnHeader';
import { IncomingGridGroupRow } from './IncomingGridGroupRow';

interface IncomingGridViewProps {
  filteredGroupedRecords: Record<string, ReceivingPoGroup[]>;
  /** Incoming keeps server ORDER BY when true (until a column sort is active). */
  serverSorted: boolean;
  loading: boolean;
  emptyMessage: string;
  isMobile: boolean;
  selectMode: boolean;
  selectedId: number | null;
  selectedIds: Set<number>;
  handleSelectRow: (row: ReceivingLineRow) => void;
  handleSelectGroup: (ids: readonly number[]) => void;
  /** Mirror of LedgerGrid scroll body for keyboard-nav / page scroll-to-top. */
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
}

function poFoldKey(row: ReceivingLineRow): string {
  const po = (row.zoho_purchaseorder_id || row.zoho_purchaseorder_number || '').trim();
  return po || `line:${row.id}`;
}

/**
 * Incoming POS spreadsheet — receiving-domain adapter over {@link LedgerGrid}.
 * Same shell recipe as outbound {@link OrdersGridView} (rounded card + airtable
 * skin + scrollX + click-to-sort headers), with Incoming columns / PO fold.
 */
export function IncomingGridView({
  filteredGroupedRecords,
  serverSorted,
  loading,
  emptyMessage,
  isMobile,
  selectMode,
  selectedId,
  selectedIds,
  handleSelectRow,
  handleSelectGroup,
  scrollRef,
  className,
}: IncomingGridViewProps) {
  // Ephemeral column sort (throwaway view state; the mode's server ORDER BY is
  // the durable default). TanStack owns the toggle cycle via LedgerGridSurface.
  const [columnSort, setColumnSort] = useState<IncomingGridColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<IncomingGridSortDir | null>(null);
  const handleSortChange = useCallback((key: IncomingGridColumnKey, dir: IncomingGridSortDir) => {
    setColumnSort(key);
    setSortDir(dir);
  }, []);

  const { orderGroupsByDate, flatRows } = useMemo(() => {
    const flat = Object.values(filteredGroupedRecords).flatMap((day) =>
      day.flatMap((g) => g.rows),
    );
    // Column sort: one flat global order (single synthetic band — LedgerGrid
    // has no day headers). Matches Pending `useOrdersQueueRows` column path.
    if (columnSort && sortDir) {
      const sorted = [...flat].sort((a, b) =>
        compareIncomingGridRows(a, b, columnSort, sortDir),
      );
      const groups = groupRowsBy(sorted, poFoldKey);
      return {
        orderGroupsByDate: [['', groups]] as [string, RowGroup<ReceivingLineRow>[]][],
        flatRows: sorted,
      };
    }

    const banded: [string, RowGroup<ReceivingLineRow>[]][] = Object.entries(filteredGroupedRecords)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, dayGroups]) => {
        const sorted = serverSorted
          ? dayGroups
          : [...dayGroups].sort((a, b) => poGroupAnchorMs(b) - poGroupAnchorMs(a));
        return [date, sorted];
      });
    return { orderGroupsByDate: banded, flatRows: flat };
  }, [filteredGroupedRecords, serverSorted, columnSort, sortDir]);

  return (
    <LedgerGridSurface<ReceivingLineRow, IncomingGridColumnKey>
      descriptor={INCOMING_GRID_DESCRIPTOR}
      orderGroupsByDate={orderGroupsByDate}
      rows={flatRows}
      sort={columnSort}
      dir={sortDir}
      onSortChange={handleSortChange}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollRef={scrollRef}
      className={className}
      testId="incoming-grid-body"
      renderColumnHeader={({ toggleColumnSort }) => (
        <IncomingGridColumnHeader
          isMobile={isMobile}
          selectMode={selectMode}
          selectionScope={RECEIVING_SELECTION_SCOPE}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
        />
      )}
      renderGroup={(group, baseStripeIndex) => (
        <IncomingGridGroupRow
          group={group}
          baseStripeIndex={baseStripeIndex}
          isMobile={isMobile}
          selectMode={selectMode}
          selectedId={selectedId}
          selectedIds={selectedIds}
          handleSelectRow={handleSelectRow}
          handleSelectGroup={handleSelectGroup}
        />
      )}
      renderRow={(row, stripeIndex) => (
        <IncomingGridGroupRow
          group={{ key: `k:${row.id}`, rows: [row] }}
          baseStripeIndex={stripeIndex}
          isMobile={isMobile}
          selectMode={selectMode}
          selectedId={selectedId}
          selectedIds={selectedIds}
          handleSelectRow={handleSelectRow}
          handleSelectGroup={handleSelectGroup}
        />
      )}
    />
  );
}
