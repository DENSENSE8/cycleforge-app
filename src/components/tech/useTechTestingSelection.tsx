'use client';

/**
 * Testing browse bulk selection for the tech dashboard. A thin wrapper over the
 * shared {@link useReceivingLineBulkSelection} (Copy / Print / Ticket / Send +
 * claim modal). Select toggles via {@link TestingWorkspaceHeader}
 * `BoardSelectToggle`. This layer only supplies the tech-specific scope and
 * copy format. Active when Testing mode is showing the history list (no line
 * selected).
 */

import { useCallback } from 'react';
import { TESTING_SELECTION_SCOPE } from '@/components/tech/TestingHistoryList';
import {
  useReceivingLineBulkSelection,
  type ReceivingLineBulkSelection,
} from '@/hooks/useReceivingLineBulkSelection';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';

/** Copy line for a tested unit: SKU • serials • PO. */
function formatTestingCopyRow(r: ReceivingLineRow): string {
  const sku = (r.sku || '').trim();
  const serials = (r.serials ?? [])
    .map((s) => (s.serial_number || '').trim())
    .filter(Boolean)
    .join('/');
  const po = (r.zoho_purchaseorder_number || r.zoho_purchaseorder_id || '').trim();
  return [sku && `SKU ${sku}`, serials && `SN ${serials}`, po && `PO ${po}`]
    .filter(Boolean)
    .join(' • ');
}

export interface TechTestingSelection {
  testingSelectMode: boolean;
  testingSelectedRows: ReceivingLineRow[];
  testingClaimRow: ReceivingLineRow | null;
  setTestingClaimRow: ReceivingLineBulkSelection['setClaimRow'];
  toggleTestingSelect: () => void;
  exitTestingSelect: () => void;
  /** History row already opens via `dispatchSelectLine`; no URL hop needed. */
  openTestingLine: () => void;
  testingBulkActions: ReceivingLineBulkSelection['bulkActions'];
}

export function useTechTestingSelection(
  /** True when Testing top-mode is active and no line panel is open. */
  browseActive: boolean,
): TechTestingSelection {
  const {
    selectMode,
    selectedRows,
    claimRow,
    setClaimRow,
    toggleSelectMode,
    exitSelectMode,
    bulkActions,
  } =
    useReceivingLineBulkSelection({
      scope: TESTING_SELECTION_SCOPE,
      active: browseActive,
      formatCopyRow: formatTestingCopyRow,
    });

  const openTestingLine = useCallback(() => {
    // Row click in TestingHistoryList already dispatches `receiving-select-line`.
  }, []);

  return {
    testingSelectMode: selectMode,
    testingSelectedRows: selectedRows,
    testingClaimRow: claimRow,
    setTestingClaimRow: setClaimRow,
    toggleTestingSelect: toggleSelectMode,
    exitTestingSelect: exitSelectMode,
    openTestingLine,
    testingBulkActions: bulkActions,
  };
}
