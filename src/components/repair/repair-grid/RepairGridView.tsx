'use client';

import { useCallback, useMemo, type RefObject } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import type { RowGroup } from '@/lib/group-rows';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import {
  REPAIR_GRID_COLUMNS,
  type RepairGridColumn,
  type RepairGridColumnKey,
} from '@/lib/repair/repair-grid-layout';
import { makeRepairGridDescriptor } from './repair-grid-descriptor';
import { RepairGridColumnHeader } from './RepairGridColumnHeader';
import { RepairGridRow } from './RepairGridRow';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Staff-prefs identity — one repair queue, one Fields selection. */
const REPAIR_TABLE_ID = 'repair' as const;

interface RepairGridViewProps {
  /** Rows in display order (already sorted by the active column, or server order). */
  records: RSRecord[];
  loading: boolean;
  emptyMessage: string;
  /** Shared with the host's `useTableSelection` + rail selection plane. */
  selectionScope: string;
  /** The open (detail-panel) record id. */
  selectedId: number | null;
  onOpenRecord: (repair: RSRecord) => void;
  /** Controlled ephemeral column sort (the host owns durability + row order). */
  sort: RepairGridColumnKey | null;
  dir: GridSortDir | null;
  onSortChange: (key: RepairGridColumnKey, dir: GridSortDir) => void;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly RepairGridColumn[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /** Portal target for the column-display (▦) trigger — e.g. the triage band controls slot. */
  columnTriggerPortalTarget?: HTMLElement | null;
}

/**
 * Repair queue spreadsheet — repair-domain adapter over {@link LedgerGridSurface}.
 * Same shell recipe as outbound `OrdersGridView` / inbound `IncomingGridView`
 * (rounded card + airtable skin + scrollX + click-to-sort headers), with the
 * repair columns and a flat (no-fold) row set. The airtable left gutter is
 * always live: checkboxes toggle the shared selection scope; the row body opens
 * the detail panel.
 */
export function RepairGridView({
  records,
  loading,
  emptyMessage,
  selectionScope,
  selectedId,
  onOpenRecord,
  sort,
  dir,
  onSortChange,
  columns = REPAIR_GRID_COLUMNS,
  scrollRef,
  className,
  columnTriggerPortalTarget,
}: RepairGridViewProps) {
  // Always-on left gutter (airtable): checkboxes toggle the set; the row body
  // selectOnly + opens the record (one selection channel — History / order D3).
  const { selectedIds, toggle, selectOnly } = useTableSelectMode<RSRecord>({
    scope: selectionScope,
    selectMode: true,
    rows: records,
    getId: (r) => r.id,
  });

  // Flat spreadsheet: one synthetic band, each repair its own singleton group
  // (no PO/day fold). Row order is the caller's (server order or column sort).
  const orderGroupsByDate = useMemo<[string, RowGroup<RSRecord>[]][]>(
    () => [['', records.map((r) => ({ key: String(r.id), rows: [r] }))]],
    [records],
  );

  const onOpen = useCallback(
    (r: RSRecord) => {
      selectOnly(r.id);
      onOpenRecord(r);
    },
    [selectOnly, onOpenRecord],
  );
  const onToggleSelect = useCallback(
    (r: RSRecord, event: { shiftKey: boolean }) => toggle(r.id, event.shiftKey),
    [toggle],
  );

  const renderLeaf = useCallback(
    (repair: RSRecord, visible: readonly RepairGridColumn[]) => (
      <RepairGridRow
        key={repair.id}
        repair={repair}
        isSelected={selectedId === repair.id}
        isChecked={selectedIds.has(repair.id)}
        onOpen={onOpen}
        onToggleSelect={onToggleSelect}
        columns={visible}
      />
    ),
    [selectedId, selectedIds, onOpen, onToggleSelect],
  );

  return (
    <LedgerGridSurface<RSRecord, RepairGridColumnKey, RepairGridColumn>
      ariaLabel="Repair queue"
      surface="sheet"
      columns={columns}
      makeDescriptor={makeRepairGridDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={records}
      getRowId={(r) => String(r.id)}
      sort={sort}
      dir={dir}
      onSortChange={onSortChange}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollRef={scrollRef}
      className={className}
      testId="repair-grid-body"
      tableId={REPAIR_TABLE_ID}
      columnTriggerPortalTarget={columnTriggerPortalTarget ?? null}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <RepairGridColumnHeader
          selectionScope={selectionScope}
          columns={visible}
          activeSort={sort}
          sortDir={dir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, _stripe, { columns: visible }) => renderLeaf(group.rows[0], visible)}
      renderRow={(row, _stripe, { columns: visible }) => renderLeaf(row, visible)}
    />
  );
}
