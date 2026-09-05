'use client';

/**
 * Receiving-line rail-selection path (Unbox / History / Incoming / Tech Testing).
 *
 * Owns the publish bridge to `rail-actions-store` so the right rail can render
 * the selection band + action region. Surfaces opt in by calling this wrapper
 * instead of mounting a bottom ContextualSelectionBar — do not dual-publish
 * from {@link useReceivingLineBulkSelection} alone.
 *
 * Plan: receiving-line selection → right rail (mirrors useOrderRailSelection /
 * docs/todo/order-rail-selection-plane-PLAN.md Phase 2); hoard History rail SoT.
 *
 * The published set is the family catalog as-is. Do not add a `mapActions`
 * override — that was the behaviour hook the table-engine law forbids.
 * Assign to… lives in the catalog and opens {@link openReceivingAssignPanel};
 * {@link ReceivingAssignPanel} in ReceivingLineRailShell is the host.
 */

import { useEffect } from 'react';
import {
  useReceivingLineBulkSelection,
  type ReceivingLineBulkSelection,
} from '@/hooks/useReceivingLineBulkSelection';
import { useTableSelectionTotal } from '@/hooks/useTableSelection';
import {
  clearRailActions,
  publishRailActions,
} from '@/lib/right-rail/rail-actions-store';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

interface UseReceivingLineRailSelectionArgs {
  scope: string;
  /** Whether the selectable surface is currently shown. */
  active: boolean;
  formatCopyRow: (row: ReceivingLineRow) => string;
  /**
   * When false, stop publishing and clear this scope's rail actions (e.g. Unbox
   * line workspace is open — Ticket/Claim/tool push stacks own the right edge).
   */
  publish?: boolean;
}

export function useReceivingLineRailSelection({
  scope,
  active,
  formatCopyRow,
  publish = true,
}: UseReceivingLineRailSelectionArgs): ReceivingLineBulkSelection {
  const bulk = useReceivingLineBulkSelection({ scope, active, formatCopyRow });
  const selectableTotal = useTableSelectionTotal(scope);
  const shouldPublish = active && publish;

  useEffect(() => {
    if (!shouldPublish) {
      clearRailActions(scope);
      return;
    }
    publishRailActions({
      scope,
      rows: bulk.selectedRows,
      actions: bulk.bulkActions,
      total: selectableTotal,
    });
  }, [
    shouldPublish,
    scope,
    bulk.selectedRows,
    bulk.bulkActions,
    selectableTotal,
  ]);

  useEffect(() => {
    return () => clearRailActions(scope);
  }, [scope]);

  return bulk;
}
