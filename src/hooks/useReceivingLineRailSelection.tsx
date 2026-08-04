'use client';

/**
 * Receiving-line rail-selection path (Unbox / History / Incoming).
 *
 * Owns the publish bridge to `rail-actions-store` so the right rail can render
 * the selection band + action region after the bottom `ContextualSelectionBar`
 * capsule is removed from those surfaces. Tech Testing keeps
 * {@link useReceivingLineBulkSelection} and the capsule — it must NOT call this
 * hook, or it would publish into the rail while the capsule kept a second copy.
 *
 * Plan: receiving-line selection → right rail (mirrors useOrderRailSelection /
 * docs/todo/order-rail-selection-plane-PLAN.md Phase 2).
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
