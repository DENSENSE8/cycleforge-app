'use client';

/**
 * Dashboard outbound rail-selection path.
 *
 * Owns the publish bridge to `rail-actions-store` so the right rail (mounted
 * off the root layout via `GlobalDetailStackHost`) can render the action
 * region. Pack and Shipping keep {@link useDashboardBulkSelection} and the
 * bottom capsule — they must NOT call this hook, or they would get a second
 * copy of every action in the inspector while the capsule kept the first.
 *
 * Plan: docs/todo/order-rail-selection-plane-PLAN.md (Phase 2 / D2).
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

export function useOrderRailSelection(orderView: DashboardOrderView): {
  selectionEnabled: boolean;
  selectMode: boolean;
  selectionOverlays: ReturnType<typeof useDashboardBulkSelection>['selectionOverlays'];
} {
  const { selectionEnabled, selectMode, selectedRows, selectionActions, selectionOverlays } =
    useDashboardBulkSelection(orderView);

  const selectableTotal = useTableSelectionTotal(DASHBOARD_ORDERS_SELECTION_SCOPE);

  // Publish the live selection so the RAIL can render the action region. The
  // rail's 1-row body (`ShippedDetailsPanel`) is mounted by
  // `GlobalDetailStackHost` off the root layout, not under this page, so a
  // module store is the only path between them — see `rail-actions-store.ts`.
  useEffect(() => {
    publishRailActions({
      scope: DASHBOARD_ORDERS_SELECTION_SCOPE,
      rows: selectedRows,
      actions: selectionActions,
      total: selectableTotal,
    });
  }, [selectedRows, selectionActions, selectableTotal]);

  // Leaving the dashboard must not leave a stale action set published — the
  // rail would keep offering "print a shipping label" over rows that are no
  // longer on screen.
  useEffect(() => {
    return () => clearRailActions(DASHBOARD_ORDERS_SELECTION_SCOPE);
  }, []);

  return { selectionEnabled, selectMode, selectionOverlays };
}
