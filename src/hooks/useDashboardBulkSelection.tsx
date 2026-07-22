'use client';

/**
 * Dashboard bulk-selection for the Unshipped / Packed / Shipped order tables.
 *
 * The tables share one selection scope (only one mounts per `?view`); FBA opts
 * out. Selection is always on when the surface supports it — left-gutter
 * checkboxes + column select-all, no chrome pencil. This hook owns the clear-
 * on-view-flip resets and the Copy / Print / Send / Delete bulk actions. The
 * floating action bar is rendered by the page from `selectionActions`.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { Copy, Printer, Smartphone, Trash2, User } from '@/components/Icons';
import { useTableSelection } from '@/hooks/useTableSelection';
import { useDeleteOrderRow } from '@/hooks/useDeleteOrderRow';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { SelectionAction } from '@/lib/selection/selection-actions';
// Lazy: the product-label printer drags the bwip-js barcode engine (~250 KB gz)
// into whatever bundle imports it statically — this hook rides in the dashboard
// page graph, and printing only happens on an explicit bulk action.
const loadProductLabelPrinter = () => import('@/lib/print/printProductLabel');
import { toast } from '@/lib/toast';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';

/**
 * Minimal shape the dashboard selection bar needs from a row — satisfied by
 * both the Unshipped (`ShippedOrder`) and Shipped (`PackerRecord`) records.
 */
export type DashSelectableRow = {
  id: number | string;
  order_id?: string | null;
  sku?: string | null;
  serial_number?: string | null;
  shipping_tracking_number?: string | null;
  tracking_number?: string | null;
  packer_log_id?: number | null;
};

export interface DashboardBulkSelection {
  /** True on the surfaces that support selection (Unshipped / Packed / Shipped). */
  selectionEnabled: boolean;
  /** Always true when selectionEnabled — left-gutter checkboxes stay live. */
  selectMode: boolean;
  /** The currently checked rows for the shared dashboard scope. */
  selectedRows: DashSelectableRow[];
  /** Copy / Print / Send / Delete actions for the contextual selection bar. */
  selectionActions: SelectionAction<DashSelectableRow>[];
}

export function useDashboardBulkSelection(
  orderView: DashboardOrderView,
): DashboardBulkSelection {
  const selectionEnabled = orderView !== 'fba';
  // Packed reuses the shipped row/delete path (packer records with packed_at).
  const isShippedView = orderView === 'shipped' || orderView === 'packed';
  // Always-on left gutter when the surface supports selection (To Ship / Packed /
  // Shipped). Select-all lives in the table column header, not chrome.
  const selectMode = selectionEnabled;
  const selectedRows = useTableSelection<DashSelectableRow>(
    DASHBOARD_ORDERS_SELECTION_SCOPE,
    (r) => Number(r.id),
  );
  const deleteOrderRow = useDeleteOrderRow();

  const clearSelection = useCallback(() => {
    emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, 'none');
  }, []);

  // Clear checks on view flip — row types + delete semantics differ. Also clear
  // when leaving a selectable surface (FBA) so a stale set never lingers.
  useEffect(() => {
    clearSelection();
  }, [orderView, clearSelection]);

  const handleCopyDetails = useCallback((rows: DashSelectableRow[]) => {
    const text = rows
      .map((r) => {
        const order = String(r.order_id || '').trim();
        const sku = String(r.sku || '').trim();
        const tracking = String(r.shipping_tracking_number || r.tracking_number || '').trim();
        const serial = String(r.serial_number || '').trim();
        return [order && `Order ${order}`, sku && `SKU ${sku}`, tracking && `TRK ${tracking}`, serial && `SN ${serial}`]
          .filter(Boolean)
          .join(' • ');
      })
      .filter(Boolean)
      .join('\n');
    if (!text) {
      toast.error('Nothing to copy on the selected row(s)');
      return;
    }
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`Copied ${rows.length} row${rows.length === 1 ? '' : 's'}`),
      () => toast.error('Copy failed'),
    );
  }, []);

  const handlePrintLabels = useCallback((rows: DashSelectableRow[]) => {
    void loadProductLabelPrinter().then(({ printProductLabel, printProductLabels }) => {
      let printed = 0;
      for (const r of rows) {
        const sku = String(r.sku || '').trim();
        if (!sku) continue;
        const serial = String(r.serial_number || '').trim();
        if (serial) printProductLabels({ sku, serialNumbers: [serial] });
        else printProductLabel({ sku });
        printed += 1;
      }
      if (printed > 0) toast.success(`Printing ${printed} label${printed === 1 ? '' : 's'}`);
      else toast.error('No SKU on the selected row(s)');
    });
  }, []);

  const handleDelete = useCallback(
    async (rows: DashSelectableRow[]) => {
      if (rows.length === 0) return;
      const noun = isShippedView ? 'shipped record' : 'order';
      const label = rows.length === 1 ? `this ${noun}` : `these ${rows.length} ${noun}s`;
      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
      try {
        if (isShippedView) {
          // No bulk packer-log endpoint — delete each (the Shipped row id IS
          // its station_activity_log id; packer_log_id is the fallback key).
          const results = await Promise.allSettled(
            rows.map((r) =>
              deleteOrderRow.mutateAsync({
                rowSource: 'packing_log',
                activityLogId: Number(r.id),
                packerLogId: r.packer_log_id ?? undefined,
              }),
            ),
          );
          const failed = results.filter((x) => x.status === 'rejected').length;
          if (failed > 0) toast.error(`${failed} of ${rows.length} could not be deleted`);
          else toast.success(rows.length === 1 ? 'Record deleted' : `${rows.length} records deleted`);
        } else {
          const orderIds = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
          await deleteOrderRow.mutateAsync({ rowSource: 'order', orderIds });
          toast.success(orderIds.length === 1 ? 'Order deleted' : `${orderIds.length} orders deleted`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      } finally {
        clearSelection();
        window.dispatchEvent(new CustomEvent('dashboard-refresh'));
      }
    },
    [isShippedView, deleteOrderRow, clearSelection],
  );

  const selectionActions = useMemo<SelectionAction<DashSelectableRow>[]>(
    () => [
      { key: 'copy', label: 'Copy details', icon: <Copy className="h-4 w-4" />, tone: 'blue', primary: true, run: handleCopyDetails },
      { key: 'print', label: 'Print labels', icon: <Printer className="h-4 w-4" />, run: handlePrintLabels },
      { key: 'staff', label: 'Send to staff', icon: <User className="h-4 w-4" />, run: () => toast('Send to staff — coming next') },
      { key: 'phone', label: 'Send to phone', icon: <Smartphone className="h-4 w-4" />, run: () => toast('Send to phone — coming next') },
      { key: 'delete', label: 'Delete', icon: <Trash2 className="h-4 w-4" />, tone: 'red', run: handleDelete },
    ],
    [handleCopyDetails, handlePrintLabels, handleDelete],
  );

  return { selectionEnabled, selectMode, selectedRows, selectionActions };
}
