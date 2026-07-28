'use client';

import { useCallback, useMemo, type RefObject } from 'react';
import { LedgerGridSurface, useGridColumnVisibility } from '@/design-system/components/grid';
import type { RowGroup } from '@/lib/group-rows';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import {
  REPAIR_GRID_COLUMNS,
  type RepairGridColumn,
  type RepairGridColumnKey,
  type RepairGridSortDir,
} from '@/lib/repair/repair-grid-layout';
import { makeRepairGridDescriptor } from './repair-grid-descriptor';
import { RepairGridColumnHeader } from './RepairGridColumnHeader';
import { RepairGridRow } from './RepairGridRow';

/** Staff-prefs identity — one repair queue, one Fields selection. */
const REPAIR_TABLE_ID = 'repair' as const;

interface RepairGridViewProps {
  /** Rows in display order (already sorted by the active column, or server order). */
  records: RSRecord[];
  loading: boolean;
  emptyMessage: string;
  /** Shared with the host's `useTableSelection` + `ContextualSelectionBar`. */
  selectionScope: string;
  /** The open (detail-panel) record id. */
  selectedId: number | null;
  onOpenRecord: (repair: RSRecord) => void;
  /** Controlled ephemeral column sort (the host owns durability + row order). */
  sort: RepairGridColumnKey | null;
  dir: RepairGridSortDir | null;
  onSortChange: (key: RepairGridColumnKey, dir: RepairGridSortDir) => void;
  /** FULL canonical column list — visibility is resolved here, not by callers. */
  columns?: readonly RepairGridColumn[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
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
}: RepairGridViewProps) {
  // Always-on left gutter (airtable): checkboxes toggle the set; the row body
  // opens the record. Broadcasts on `selectionScope` for the host's action bar.
  const { selectedIds, toggle } = useTableSelectMode<RSRecord>({
    scope: selectionScope,
    selectMode: true,
    rows: records,
    getId: (r) => r.id,
  });

  // ONE visibility resolution: descriptor default tier + this staffer's delta.
  // Header, rows and the grid template all read `visible` — a hidden column
  // loses its TRACK rather than rendering an empty ruled cell.
  const { columns: visible } = useGridColumnVisibility<RepairGridColumn>({
    columns,
    tableId: REPAIR_TABLE_ID,
  });

  const descriptor = useMemo(() => makeRepairGridDescriptor(visible), [visible]);

  // Flat spreadsheet: one synthetic band, each repair its own singleton group
  // (no PO/day fold). Row order is the caller's (server order or column sort).
  const orderGroupsByDate = useMemo<[string, RowGroup<RSRecord>[]][]>(
    () => [['', records.map((r) => ({ key: String(r.id), rows: [r] }))]],
    [records],
  );

  const onOpen = useCallback((r: RSRecord) => onOpenRecord(r), [onOpenRecord]);
  const onToggleSelect = useCallback(
    (r: RSRecord, event: { shiftKey: boolean }) => toggle(r.id, event.shiftKey),
    [toggle],
  );

  const renderLeaf = useCallback(
    (repair: RSRecord, stripeIndex: number) => (
      <RepairGridRow
        key={repair.id}
        repair={repair}
        index={stripeIndex}
        isSelected={selectedId === repair.id}
        isChecked={selectedIds.has(repair.id)}
        onOpen={onOpen}
        onToggleSelect={onToggleSelect}
        columns={visible}
      />
    ),
    [selectedId, selectedIds, onOpen, onToggleSelect, visible],
  );

  return (
    <LedgerGridSurface<RSRecord, RepairGridColumnKey>
      ariaLabel="Repair queue"
      descriptor={descriptor}
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
      renderColumnHeader={({ toggleColumnSort }) => (
        <RepairGridColumnHeader
          selectionScope={selectionScope}
          columns={visible}
          activeSort={sort}
          sortDir={dir}
          onSortColumn={toggleColumnSort}
        />
      )}
      renderGroup={(group, baseStripeIndex) => renderLeaf(group.rows[0], baseStripeIndex)}
      renderRow={(row, stripeIndex) => renderLeaf(row, stripeIndex)}
    />
  );
}
