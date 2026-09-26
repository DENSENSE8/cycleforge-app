'use client';

import { useState, type ReactNode } from 'react';
import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import type { ReceivingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import type { CustomFieldDef } from '@/lib/custom-fields/types';
import { ReceivingGridRow } from './ReceivingGridRow';
import {
  SlotTableGroupFold,
  SlotTableGroupFoldBody,
  SlotTableGroupParentRow,
} from '@/components/tables/compound/SlotTableGroupParentRow';
 import { orderCarrierBoxes } from '@/lib/orders/order-group-identity';
 import { receivingGroupIdentity } from '@/lib/receiving/receiving-group-identity';
import { bandQtyRollupPart } from '@/lib/receiving/receiving-group-rollup';
import { receivingGroupRollup } from '@/lib/receiving/receiving-group-rollup';
import { receivingCompoundView } from '@/lib/receiving/receiving-compound-view';
import { displayReceivingProductTitle } from './cells';

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
  /** Unbox / Receiving History → `'coarse'`; Testing stays `'fine'`. */
  statusVocabulary?: 'fine' | 'coarse';
  /** Connected inventory provider label for History UNBOXED tips. */
  inventoryProviderLabel?: string;
  columns: readonly ReceivingGridColumn[];
  selectGutterChrome?: GridSelectGutterChrome;
  /** Unbox History: click toggles select; double-click opens. */
  clickSelect?: boolean;
  /** Persisted row fills keyed by stringified id. */
  rowFillsById?: Readonly<Record<string, string>>;
  /** Unbox compare crosshair carton id (peer wash). */
  linkedReceivingId?: number | null;
  onCrosshairHover?: (receivingId: number | null) => void;
  /** Live custom_field_defs for `custom:*` columns. */
  customFieldDefs?: readonly CustomFieldDef[];
  subtitleFieldIds?: readonly string[];
}

/**
 * One PO group inside the Unbox / History LedgerGrid.
 * Operator 2026-09-05: Unbox and Inbound must display exactly like To-ship.
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
  statusVocabulary = 'fine',
  inventoryProviderLabel = 'Inventory',
  columns,
  selectGutterChrome = 'always',
  clickSelect = false,
  rowFillsById,
  linkedReceivingId = null,
  onCrosshairHover,
  customFieldDefs,
  subtitleFieldIds,
}: ReceivingGridGroupRowProps) {
  // A fold of one is just a line — no band, no quieting.
  const multi = group.rows.length > 1;
  const [folded, setFolded] = useState(false);
  const identity = multi ? receivingGroupIdentity(group.rows) : null;
  const { carriers, boxCount, trackings } = orderCarrierBoxes(group.rows);
  const ids = group.rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
   const checked = checkedCount === 0 ? false : checkedCount === ids.length ? true : 'mixed';

  // Band rollups (operator 2026-09-14, "implement all 1-3"):
  // Band rollups (operator 2026-09-14, "implement all 1-3"): the band is a
  const rollup = receivingGroupRollup(group.rows);
  const bandView = receivingCompoundView(group.rows[0]!, {
    title: displayReceivingProductTitle(group.rows[0]!),
    stateLabel: rollup.label,
    stateTone: rollup.tone,
    stateTip: rollup.tip,
    delayDays: null,
    tracking: null,
    orderId: null,
  });
  bandView.subtitleParts = [
    bandQtyRollupPart('receiving.qty', rollup.qtyReceived, rollup.qtyExpected),
  ];
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
        // Two independent planes:
        isOpen={isOpen}
        isChecked={isChecked}
        isLinked={isLinked}
        onSelect={() => handleSelectRow(row)}
        onToggle={handleToggleRow ? () => handleToggleRow(row) : undefined}
        onCrosshairHover={onCrosshairHover}
        activityAxis={activityAxis}
        isHistory={isHistory}
        statusVocabulary={statusVocabulary}
        inventoryProviderLabel={inventoryProviderLabel}
        columns={columns}
        selectGutterChrome={selectGutterChrome}
        clickSelect={clickSelect}
        rowFillHex={rowFillsById?.[String(row.id)] ?? null}
        quietIdentity={multi}
        customFieldDefs={customFieldDefs}
        subtitleFieldIds={subtitleFieldIds}
      />
    );
  };

  return (
    <SlotTableGroupFold multi={multi}>
      {multi && columns ? (
        <SlotTableGroupParentRow
          identity={identity}
          carriers={carriers}
          boxCount={boxCount}
          trackings={trackings}
          columns={columns}
          identityColumnKey="fulfillment"
          checked={checked}
          onToggle={() => {
            if (!handleToggleRow) return;
            const turnOn = checked !== true;
            for (const row of group.rows) {
              if (selectedIds.has(row.id) !== turnOn) handleToggleRow(row);
            }
          }}
          selectCount={group.rows.length}
          folded={folded}
          onToggleFold={() => setFolded((open) => !open)}
          view={bandView}
        />
      ) : null}
      {folded ? null : (
        <SlotTableGroupFoldBody multi={multi}>
          {group.rows.map((row, i) => renderLeaf(row, baseStripeIndex + i))}
        </SlotTableGroupFoldBody>
      )}
    </SlotTableGroupFold>
  );
}
