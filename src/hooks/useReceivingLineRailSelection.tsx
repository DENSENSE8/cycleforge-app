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
 */

import { useEffect, useMemo } from 'react';
import {
  useReceivingLineBulkSelection,
  type ReceivingLineBulkSelection,
} from '@/hooks/useReceivingLineBulkSelection';
import { useTableSelectionTotal } from '@/hooks/useTableSelection';
import {
  clearRailActions,
  publishRailActions,
} from '@/lib/right-rail/rail-actions-store';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { SelectionAction } from '@/lib/selection/selection-actions';

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
  /**
   * Replace or extend the default Copy/Print/Ticket/… set before publish.
   * Testing uses this to swap the stub "Send to staff" for a real Assign path.
   */
  mapActions?: (
    actions: SelectionAction<ReceivingLineRow>[],
  ) => SelectionAction<ReceivingLineRow>[];
}

export function useReceivingLineRailSelection({
  scope,
  active,
  formatCopyRow,
  publish = true,
  mapActions,
}: UseReceivingLineRailSelectionArgs): ReceivingLineBulkSelection {
  const bulk = useReceivingLineBulkSelection({ scope, active, formatCopyRow });
  const selectableTotal = useTableSelectionTotal(scope);
  const shouldPublish = active && publish;

  const publishedActions = useMemo(
    () => (mapActions ? mapActions(bulk.bulkActions) : bulk.bulkActions),
    [bulk.bulkActions, mapActions],
  );

  useEffect(() => {
    if (!shouldPublish) {
      clearRailActions(scope);
      return;
    }
    publishRailActions({
      scope,
      rows: bulk.selectedRows,
      actions: publishedActions,
      total: selectableTotal,
    });
  }, [
    shouldPublish,
    scope,
    bulk.selectedRows,
    publishedActions,
    selectableTotal,
  ]);

  useEffect(() => {
    return () => clearRailActions(scope);
  }, [scope]);

  return {
    ...bulk,
    bulkActions: publishedActions,
  };
}
