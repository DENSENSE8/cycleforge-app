'use client';

import { useCallback, useMemo, type RefObject } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import type { RowGroup } from '@/lib/group-rows';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { useTableSelectMode } from '@/hooks/useTableSelectMode';
import type {
  RepairGridColumnKey,
  RepairGridSortDir,
} from '@/lib/repair/repair-grid-layout';
import { REPAIR_GRID_DESCRIPTOR } from './repair-grid-descriptor';
import { RepairGridColumnHeader } from './RepairGridColumnHeader';
import { RepairGridRow } from './RepairGridRow';

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
      />
    ),
    [selectedId, selectedIds, onOpen, onToggleSelect],
  );

  return (
    <LedgerGridSurface<RSRecord, RepairGridColumnKey>
      descriptor={REPAIR_GRID_DESCRIPTOR}
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
