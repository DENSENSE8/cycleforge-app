'use client';

import type { ReactNode } from 'react';
import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { GridColumnDisplayPref } from '@/design-system/components/grid';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import type { ReceivingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import { ReceivingGridRow } from './ReceivingGridRow';

interface ReceivingGridGroupRowProps {
  group: RowGroup<ReceivingLineRow>;
  baseStripeIndex: number;
  isMobile: boolean;
  selectMode: boolean;
  selectedId: number | null;
  selectedIds: Set<number>;
  handleSelectRow: (row: ReceivingLineRow) => void;
  /**
   * Select-gutter click — bulk membership only, never opens a record. Present
   * only where the row body has been handed to the record plane (History);
   * omitted on the single-gesture surfaces (Unbox workbench, Testing, Pickup).
   */
  handleToggleRow?: (row: ReceivingLineRow) => void;
  activityAxis?: ReceivingActivityAxis;
  isHistory?: boolean;
  /** Connected inventory provider label for History UNBOXED tips. */
  inventoryProviderLabel?: string;
  columns?: readonly ReceivingGridColumn[];
  /** Per-hideKey display prefs (highlight / chip). */
  columnDisplay?: Readonly<Record<string, GridColumnDisplayPref>>;
  selectGutterChrome?: GridSelectGutterChrome;
  /** Unbox History: click toggles select; double-click opens. */
  clickSelect?: boolean;
  /** Unbox History: double-click / Enter → LineEditPanel. */
  onOpenWorkspace?: (row: ReceivingLineRow) => void;
  /** Unbox History — richer context menu. */
  historyTriageMenu?: boolean;
  /** Persisted row fills keyed by stringified id. */
  rowFillsById?: Readonly<Record<string, string>>;
  /** Unbox compare crosshair carton id (peer wash). */
  linkedReceivingId?: number | null;
  onCrosshairHover?: (receivingId: number | null) => void;
}

/**
 * One PO group inside the Unbox / History LedgerGrid.
 *
 * Always a flat list of leaf lines — no collapsible PO title summary. Grouping
 * still drives day-band ordering upstream; each line is its own selectable
 * record (Sheets click-select golden). A summary row duplicated Order / PO
 * already on every leaf and sheared sticky columns under h-scroll.
 */
export function ReceivingGridGroupRow({
  group,
  baseStripeIndex,
  isMobile,
  selectMode,
  selectedId,
  selectedIds,
  handleSelectRow,
  handleToggleRow,
  activityAxis = 'unboxed',
  isHistory = false,
  inventoryProviderLabel = 'Inventory',
  columns,
  columnDisplay,
  selectGutterChrome = 'always',
  clickSelect = false,
  onOpenWorkspace,
  historyTriageMenu = false,
  rowFillsById,
  linkedReceivingId = null,
  onCrosshairHover,
}: ReceivingGridGroupRowProps) {
  const renderLeaf = (row: ReceivingLineRow, stripeIndex: number): ReactNode => {
    const isOpen = handleToggleRow
      ? selectedId === row.id
      : !selectMode && selectedId === row.id;
    const isChecked = selectMode && selectedIds.has(row.id);
    const isLinked =
      linkedReceivingId != null
      && row.receiving_id === linkedReceivingId
      && !isOpen
      && !isChecked;
    return (
      <ReceivingGridRow
        key={row.id}
        row={row}
        index={stripeIndex}
        isMobile={isMobile}
        selectMode={selectMode}
        // Two independent planes: `isOpen` is the focused record, `isChecked` is
        // bulk membership. Collapsing them into one flag is what let an always-on
        // select mode turn the whole row into a checkbox. On a surface that has
        // NOT split them, only one can be true at a time — the row click writes
        // whichever the mode says — so `isOpen` stays gated on `!selectMode`
        // there, preserving the legacy fill exactly.
        isOpen={isOpen}
        isChecked={isChecked}
        isLinked={isLinked}
        onSelect={() => handleSelectRow(row)}
        onToggle={handleToggleRow ? () => handleToggleRow(row) : undefined}
        onOpenWorkspace={onOpenWorkspace ? () => onOpenWorkspace(row) : undefined}
        historyTriageMenu={historyTriageMenu}
        onCrosshairHover={onCrosshairHover}
        activityAxis={activityAxis}
        isHistory={isHistory}
        inventoryProviderLabel={inventoryProviderLabel}
        columns={columns}
        columnDisplay={columnDisplay}
        selectGutterChrome={selectGutterChrome}
        clickSelect={clickSelect}
        rowFillHex={rowFillsById?.[String(row.id)] ?? null}
      />
    );
  };

  return (
    <>
      {group.rows.map((row, i) => renderLeaf(row, baseStripeIndex + i))}
    </>
  );
}
