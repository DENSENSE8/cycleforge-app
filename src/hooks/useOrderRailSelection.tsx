'use client';

/**
 * Order-table rail-selection path (dashboard outbound, Pack queue, Shipping
 * pending/urgent).
 *
 * Owns the publish bridge to `rail-actions-store` so the right rail (mounted
 * off the root layout via `GlobalDetailStackHost`) can render the action
 * region. Surfaces opt in by calling this wrapper instead of mounting a
 * bottom ContextualSelectionBar — do not dual-publish from the plain bulk hook.
 *
 * Plan: docs/todo/order-rail-selection-plane-PLAN.md; hoard History rail SoT.
 */

import { useEffect } from 'react';
import { useDashboardBulkSelection } from '@/hooks/useDashboardBulkSelection';
import { useTableSelectionTotal } from '@/hooks/useTableSelection';
import {
  clearRailActions,
  publishRailActions,
} from '@/lib/right-rail/rail-actions-store';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';

export function useOrderRailSelection(
  orderView: DashboardOrderView,
  opts: {
    /**
     * When false, stop publishing and clear this scope's rail actions (e.g. Pack
     * History tab — the queue grid is not mounted).
     */
    publish?: boolean;
  } = {},
): {
  selectionEnabled: boolean;
  selectMode: boolean;
  selectionOverlays: ReturnType<typeof useDashboardBulkSelection>['selectionOverlays'];
} {
  const { publish = true } = opts;
  const { selectionEnabled, selectMode, selectedRows, selectionActions, selectionOverlays } =
    useDashboardBulkSelection(orderView);

  const selectableTotal = useTableSelectionTotal(DASHBOARD_ORDERS_SELECTION_SCOPE);
  const shouldPublish = publish && selectionEnabled;

  // Publish the live selection so the RAIL can render the action region. The
  // rail's 1-row body (`ShippedDetailsPanel`) is mounted by
  // `GlobalDetailStackHost` off the root layout, not under this page, so a
  // module store is the only path between them — see `rail-actions-store.ts`.
  useEffect(() => {
    if (!shouldPublish) {
      clearRailActions(DASHBOARD_ORDERS_SELECTION_SCOPE);
      return;
    }
    publishRailActions({
      scope: DASHBOARD_ORDERS_SELECTION_SCOPE,
      rows: selectedRows,
      actions: selectionActions,
      total: selectableTotal,
    });
  }, [shouldPublish, selectedRows, selectionActions, selectableTotal]);

  // Leaving the dashboard must not leave a stale action set published — the
  // rail would keep offering "print a shipping label" over rows that are no
  // longer on screen.
  useEffect(() => {
    return () => clearRailActions(DASHBOARD_ORDERS_SELECTION_SCOPE);
  }, []);

  return { selectionEnabled, selectMode, selectionOverlays };
}
