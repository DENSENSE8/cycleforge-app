'use client';

import { useMemo, useState, type RefObject } from 'react';
import { LedgerGridSurface, useGridColumnVisibility } from '@/design-system/components/grid';
import { GridColumnDetailsPanel } from '@/components/ui/table-column-config/GridColumnDetailsPanel';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { TableId } from '@/lib/tables/table-columns';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import {
  poGroupAnchorMs,
  RECEIVING_SELECTION_SCOPE,
  type ReceivingPoGroup,
} from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import {
  INCOMING_GRID_COLUMNS,
  defaultDirForIncomingGridSort,
  isIncomingGridSortable,
  type IncomingGridColumn,
  type IncomingGridColumnKey,
} from '@/lib/receiving/incoming-grid-layout';
import { makeIncomingGridDescriptor } from './incoming-grid-descriptor';
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
  /** Row-body click — opens the record in the Incoming inspector. */
  handleSelectRow: (row: ReceivingLineRow) => void;
  /** Select-gutter click — bulk membership only. */
  handleToggleRow: (row: ReceivingLineRow) => void;
  handleSelectGroup: (ids: readonly number[]) => void;
  /** FULL canonical column list — visibility is resolved here, not by callers. */
  columns?: readonly IncomingGridColumn[];
  /**
   * Staff-prefs identity for per-staff column config. Incoming owns its own
   * `incoming` bucket — distinct from Unbox/History `receiving` — so Fields
   * toggles cannot cross-contaminate divergent descriptors.
   */
  tableId?: TableId;
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
  handleToggleRow,
  handleSelectGroup,
  columns = INCOMING_GRID_COLUMNS,
  tableId = 'incoming',
  scrollRef,
  className,
}: IncomingGridViewProps) {
  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law),
  // so a reload or a shared link reproduces the operator's view. Deliberately
  // NOT `?sort=` — that param is the Incoming SERVER ORDER BY vocabulary
  // (`useIncomingFilters`: zoho_newest / expected_soonest / …), and a header
  // click must never rewrite the API query. Mode switches clear both via
  // the route's param spec. TanStack still owns the asc↔desc cycle.
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<IncomingGridColumnKey>({
    isColumn: isIncomingGridSortable,
    defaultDir: defaultDirForIncomingGridSort,
  });

  // ONE visibility resolution: descriptor default tier + this staffer's delta.
  // Header, rows, group summaries and the grid template all read `visible` —
  // a hidden column loses its TRACK rather than rendering an empty ruled cell.
  const [columnDetailsOpen, setColumnDetailsOpen] = useState(false);

  const { columns: visible } = useGridColumnVisibility<IncomingGridColumn>({
    columns,
    tableId,
  });

  const descriptor = useMemo(() => makeIncomingGridDescriptor(visible), [visible]);

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
    <>
      <LedgerGridSurface<ReceivingLineRow, IncomingGridColumnKey>
        ariaLabel="Incoming cartons"
        descriptor={descriptor}
        orderGroupsByDate={orderGroupsByDate}
        rows={flatRows}
        sort={columnSort}
        dir={sortDir}
        onSortChange={setSort}
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
            columns={visible}
            activeSort={columnSort}
            sortDir={sortDir}
            onSortColumn={toggleColumnSort}
            onOpenColumnDetails={() => setColumnDetailsOpen(true)}
            columnDetailsOpen={columnDetailsOpen}
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
            handleToggleRow={handleToggleRow}
            handleSelectGroup={handleSelectGroup}
            columns={visible}
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
            handleToggleRow={handleToggleRow}
            handleSelectGroup={handleSelectGroup}
            columns={visible}
          />
        )}
      />
      <GridColumnDetailsPanel
        open={columnDetailsOpen}
        onClose={() => setColumnDetailsOpen(false)}
        tableId={tableId}
        columns={columns}
      />
    </>
  );
}
