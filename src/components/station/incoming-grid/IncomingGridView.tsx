'use client';

import { useMemo, type RefObject } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
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
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
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
  /** Row-body activate — opens the record (dblclick when clickSelect). */
  handleSelectRow: (row: ReceivingLineRow) => void;
  /** Bulk membership — gutter when split planes; whole-row click when clickSelect. */
  handleToggleRow: (row: ReceivingLineRow) => void;
  handleSelectGroup: (ids: readonly number[]) => void;
  /**
   * Unbox Sheets click-select: plain click toggles bulk; double-click / Enter
   * opens the inspector. Select track stays for header select-all only.
   */
  clickSelect?: boolean;
  /** Select-gutter face chrome — `'sheets'` when clickSelect. */
  selectGutterChrome?: GridSelectGutterChrome;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
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
 * Unbox Sheets golden: flush `surface="sheet"` + click-select (no checkbox
 * faces); double-click opens the Incoming inspector.
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
  clickSelect = false,
  selectGutterChrome = 'always',
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
    <LedgerGridSurface<ReceivingLineRow, IncomingGridColumnKey, IncomingGridColumn>
      ariaLabel="Incoming cartons"
      columns={columns}
      makeDescriptor={makeIncomingGridDescriptor}
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
      tableId={tableId}
      surface="sheet"
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <IncomingGridColumnHeader
          isMobile={isMobile}
          selectMode={selectMode}
          selectionScope={RECEIVING_SELECTION_SCOPE}
          selectGutterChrome={selectGutterChrome}
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
          onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, baseStripeIndex, { columns: visible }) => (
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
          clickSelect={clickSelect}
          selectGutterChrome={selectGutterChrome}
          columns={visible}
        />
      )}
      renderRow={(row, stripeIndex, { columns: visible }) => (
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
          clickSelect={clickSelect}
          selectGutterChrome={selectGutterChrome}
          columns={visible}
        />
      )}
    />
  );
}
