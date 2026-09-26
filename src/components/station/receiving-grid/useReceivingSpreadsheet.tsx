'use client';

import { useCallback, useMemo, type RefObject } from 'react';
import { useGridRowFills } from '@/design-system/components/grid';
import {
  DataTable,
  type DataTableFilterChrome,
  type DataTableSearch,
} from '@/components/tables/DataTable';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { useCustomFieldDefs } from '@/hooks/useCustomFieldDefs';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import type { TableId } from '@/lib/tables/table-columns';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import {
  poGroupAnchorMs,
  RECEIVING_SELECTION_SCOPE,
  type ReceivingActivityAxis,
  type ReceivingPoGroup,
} from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { compareReceivingGridRows } from '@/lib/receiving/receiving-grid-compare';
import {
  defaultDirForReceivingGridSort,
  isReceivingGridSortable,
  type ReceivingGridColumn,
  type ReceivingGridColumnKey,
} from '@/lib/receiving/receiving-grid-layout';
import type { DataTableFieldsMenuData } from '@/components/tables/DataTable';
import { RECEIVING_TABLE_BINDING } from './receiving-table-definition';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import { ReceivingGridGroupRow } from './ReceivingGridGroupRow';
import { mergeCustomFieldColumns } from '@/lib/custom-fields/column-model';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { commitReceivingLineNote } from '@/lib/receiving/commit-receiving-line-note';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';

export interface ReceivingSpreadsheetProps {
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
  /** Row-body click. Opens the record on surfaces that split the two planes. */
  handleSelectRow: (row: ReceivingLineRow) => void;
  /** Select-gutter click — bulk membership only. */
  handleToggleRow?: (row: ReceivingLineRow) => void;
  /** Activity-axis stamp — drives the `date` cell + the column sort. */
  activityAxis?: ReceivingActivityAxis;
  /** History / recent surface flag; status dots use getStatusDotBg (terminal tones win). */
  isHistory?: boolean;
  /**
   * Status chip vocabulary. Unbox / Receiving History passes `'coarse'` so
   * testing terminals (FAILED, …) paint as Received. Testing History omits
   * (default `'fine'`) so Failed / Passed stay visible.
   */
  statusVocabulary?: 'fine' | 'coarse';
  /** Selection bus scope (defaults to receiving). */
  selectionScope?: string;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly ReceivingGridColumn[];
  /**
   * Fields-picker DATA for the toolbar `+` popover, from the caller's slot
   * layout hook. Absent ⇒ no picker, which is the honest face for a mount
   * with no catalog behind it.
   */
  fields?: DataTableFieldsMenuData;
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
  /**
   * Controlled column sort (compare panes). When omitted, uses durable URL
   * `?colsort=` / `?coldir=`.
   */
  controlledSort?: ReceivingGridColumnKey | null;
  controlledSortDir?: 'asc' | 'desc' | null;
  onControlledSortChange?: (
    key: ReceivingGridColumnKey,
    dir?: 'asc' | 'desc',
  ) => void;
  onControlledSortClear?: () => void;
  /** Enable Sheets header context menu (Unbox / compare). Default true. */
  enableColumnMenu?: boolean;
  /** Select-gutter chrome. */
  selectGutterChrome?: GridSelectGutterChrome;
  /**
   * Unbox History click-select: click toggles bulk; double-click
   * opens; select track shows decorative check when selected; header
   * paint-bucket paints selected rows (History).
   */
  clickSelect?: boolean;
  /**
   * Unbox compare crosshair — carton `receiving_id` to wash as linked peer.
   * Omitted on single-pane mounts.
   */
  linkedReceivingId?: number | null;
  /** Pointer enter/leave on a carton row (compare host only). */
  onCrosshairHover?: (receivingId: number | null) => void;
  /** The find field, as data — the surface above owns the URL it writes. */
  search: DataTableSearch;
  /**
   * Funnel beside search. Omit and DataTable mounts idle chrome so the icon
   * still paints. Unbox Queue/Viewed/History pass `useReceivingTableChrome`.
   */
  filter?: DataTableFilterChrome;
  /**
   * History View topics: never paint card-corner ▦ while the inspector host
   * is absent (same contract as To Ship).
   */
}

function poFoldKey(row: ReceivingLineRow): string {
  const po = (row.zoho_purchaseorder_id || row.zoho_purchaseorder_number || '').trim();
  return po || `line:${row.id}`;
}

/**
 * Unbox / History / Testing spreadsheet — shared receiving-domain binding
 * for `receiving.browse`. Display is {@link DataTable}. This module owns the
 * feed fold + day-band math, sort durability, and family row renderers.
 */
export function ReceivingSpreadsheet({
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
  handleToggleRow,
  activityAxis = 'unboxed',
  isHistory = false,
  statusVocabulary = 'fine',
  selectionScope = RECEIVING_SELECTION_SCOPE,
  columns,
  fields,
  tableId,
  showDayHeaders,
  scrollRef,
  className,
  testId,
  controlledSort,
  controlledSortDir,
  onControlledSortChange,
  onControlledSortClear,
  enableColumnMenu = true,
  selectGutterChrome = 'always',
  clickSelect = false,
  linkedReceivingId = null,
  onCrosshairHover,
  search,
  filter,
}: ReceivingSpreadsheetProps) {
  // One fetch for the whole grid — History UNBOXED tips name the connected
  // inventory provider (falls back to capability title while loading).
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');

  // Geometry + identity resolve from the `receiving.browse` DEFINITION; the two overrides below exist because Testing History genuinely…
  const { data: customDefs = [] } = useCustomFieldDefs('RECEIVING');
  const systemColumns = columns ?? RECEIVING_TABLE_BINDING.columns;
  const allColumns = mergeCustomFieldColumns(systemColumns, customDefs);
  const prefsTableId = tableId ?? RECEIVING_TABLE_BINDING.definition.tableId;

  // No custom-field commit handler:

  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law),
  // so a reload or a shared link reproduces the operator's view. Mode switches
  // clear it via the route's param spec. TanStack still owns the asc↔desc cycle.
  const {
    sort: urlSort,
    dir: urlSortDir,
    setSort,
    toggleColumnSort,
    clear: clearSort,
  } = useUrlColumnSort<ReceivingGridColumnKey>({
    isColumn: isReceivingGridSortable,
    defaultDir: defaultDirForReceivingGridSort,
  });

  // Pane mounts can pass controlled sort so compare panes don't fight over URL.
  const columnSort = controlledSort !== undefined ? controlledSort : urlSort;
  const sortDir = controlledSortDir !== undefined ? controlledSortDir : urlSortDir;
  const applySort =
    onControlledSortChange
    ?? ((key: ReceivingGridColumnKey, dir?: 'asc' | 'desc') => setSort(key, dir));
  const applyToggle =
    onControlledSortChange
      ? (key: ReceivingGridColumnKey) => {
          const nextDir =
            columnSort === key && sortDir === 'asc'
              ? 'desc'
              : columnSort === key && sortDir === 'desc'
                ? 'asc'
                : defaultDirForReceivingGridSort(key);
          onControlledSortChange(key, nextDir);
        }
      : toggleColumnSort;
  const applyClear =
    onControlledSortClear
    ?? clearSort;

  const queryClient = useQueryClient();
  const { fillsById } = useGridRowFills(prefsTableId);

  const { orderGroupsByDate, flatRows } = useMemo(() => {
    const flatFromGroups = filteredGroupedRecords
      ? Object.values(filteredGroupedRecords).flatMap((day) => day.flatMap((g) => g.rows))
      : [];
    const flatFromDays = daySections ? daySections.flatMap(([, rows]) => rows) : [];
    const flat = flatFromGroups.length > 0 ? flatFromGroups : flatFromDays;
    const needle = (search?.value ?? '').trim();
    const searched = needle
      ? flat.filter((row) => receivingLineMatchesQuery(row, needle))
      : flat;

    if (columnSort && sortDir) {
      const sorted = [...searched].sort((a, b) =>
        compareReceivingGridRows(a, b, columnSort, sortDir, activityAxis),
      );
      const groups = groupRowsBy(sorted, poFoldKey);
      return {
        orderGroupsByDate: [['', groups]] as [string, RowGroup<ReceivingLineRow>[]][],
        flatRows: sorted,
      };
    }

    if (filteredGroupedRecords) {
      if (needle) {
        const groups = groupRowsBy(searched, poFoldKey);
        return {
          orderGroupsByDate: [['', groups]] as [string, RowGroup<ReceivingLineRow>[]][],
          flatRows: searched,
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
      return { orderGroupsByDate: banded, flatRows: searched };
    }

    const groups = groupRowsBy(searched, poFoldKey);
    return {
      orderGroupsByDate: [['', groups]] as [string, RowGroup<ReceivingLineRow>[]][],
      flatRows: searched,
    };
  }, [filteredGroupedRecords, daySections, serverSorted, columnSort, sortDir, activityAxis, search?.value]);
  // Inline NOTE commit — same shape as the custom-field commit above: the cell
  // has already painted, this keeps every other view of the row in step, and a
  // failure both rolls the cache back and says so.
  const handleCommitNote = useCallback(
    (lineId: number, next: string) => {
      if (lineId <= 0) return;
      const previous = flatRows.find((r) => r.id === lineId)?.notes ?? null;
      void commitReceivingLineNote({ queryClient, lineId, previous, next }).catch(
        (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Failed to save note');
        },
      );
    },
    [queryClient, flatRows],
  );


  return (
    <DataTable<ReceivingLineRow, ReceivingGridColumnKey, ReceivingGridColumn>
      binding={RECEIVING_TABLE_BINDING}
      columns={allColumns}
      fields={fields}
      orderGroupsByDate={orderGroupsByDate}
      rows={flatRows}
      sort={columnSort}
      dir={sortDir}
      onSortChange={applySort}
      loading={loading}
      emptyMessage={emptyMessage}
      search={search}
      filter={filter}
      selectionScope={selectMode ? selectionScope : undefined}
      showDayHeaders={showDayHeaders}
      scrollRef={scrollRef}
      className={className}
      testId={testId}
      renderGroup={(group, baseStripeIndex, { columns: visible }) => (
        <ReceivingGridGroupRow
          group={group}
          baseStripeIndex={baseStripeIndex}
          isMobile={isMobile}
          selectMode={selectMode}
          selectedId={selectedId}
          selectedIds={selectedIds}
          handleSelectRow={handleSelectRow}
          handleToggleRow={handleToggleRow}
          activityAxis={activityAxis}
          isHistory={isHistory}
          statusVocabulary={statusVocabulary}
          inventoryProviderLabel={inventoryProviderLabel}
          columns={visible}
          selectGutterChrome={selectGutterChrome}
          clickSelect={clickSelect}
          rowFillsById={clickSelect ? fillsById : undefined}
          linkedReceivingId={linkedReceivingId}
          onCrosshairHover={onCrosshairHover}
          customFieldDefs={customDefs}
        />
      )}
      renderRow={(row, stripeIndex, { columns: visible }) => (
        <ReceivingGridGroupRow
          group={{ key: `k:${row.id}`, rows: [row] }}
          baseStripeIndex={stripeIndex}
          isMobile={isMobile}
          selectMode={selectMode}
          selectedId={selectedId}
          selectedIds={selectedIds}
          handleSelectRow={handleSelectRow}
          handleToggleRow={handleToggleRow}
          activityAxis={activityAxis}
          isHistory={isHistory}
          statusVocabulary={statusVocabulary}
          inventoryProviderLabel={inventoryProviderLabel}
          columns={visible}
          selectGutterChrome={selectGutterChrome}
          clickSelect={clickSelect}
          rowFillsById={clickSelect ? fillsById : undefined}
          linkedReceivingId={linkedReceivingId}
          onCrosshairHover={onCrosshairHover}
          customFieldDefs={customDefs}
        />
      )}
    />
  );
}
