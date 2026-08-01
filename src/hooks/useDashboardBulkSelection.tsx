'use client';

/**
 * Dashboard bulk-selection for the Unshipped / Packed / Shipped order tables.
 *
 * The tables share one selection scope (only one mounts per `?view`); FBA opts
 * out. Selection is always on when the surface supports it — left-gutter
 * checkboxes + column select-all, no chrome pencil. This hook owns the clear-
 * on-view-flip resets and the bulk actions. The floating action bar is rendered
 * by the page from `selectionActions`; overlays those actions open (the
 * assignment carousel, the ship-by picker) come back as `selectionOverlays`.
 *
 * **Actions diverge by lifecycle stage, layout does not** (the house rule these
 * lanes are built on). All four outbound tabs render one grid component with one
 * persisted column layout, but "assign a tester" is meaningless on Shipped and
 * "print a shipping label" is meaningless on Pending — so every action declares
 * the views it belongs to via `enabled`, and `ContextualSelectionBar` drops the
 * ones that cannot fire instead of showing dead buttons.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar as CalendarIcon, Copy, Download, FileText, Flag, Printer, Trash2, User } from '@/components/Icons';
import { useTableSelection } from '@/hooks/useTableSelection';
import { useDeleteOrderRow } from '@/hooks/useDeleteOrderRow';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { useWorkOrderAssignment } from '@/hooks/useWorkOrderAssignment';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';
import { isPdfOutboundDocument } from '@/lib/documents/outbound-document-display';
import { printOutboundDocuments, type PrintableOutboundDocument } from '@/lib/print/printOutboundDocuments';
import { buildAssignmentRow } from '@/components/shipped/details-panel/shipped-details-logic';
import {
  buildOrderExportCsv,
  orderExportFilename,
  type ExportableOrderRow,
} from '@/lib/dashboard/order-export-csv';
import { orderBulkActionKeys } from '@/lib/selection-context/order-inspector-context';
import { WorkOrderAssignmentCard } from '@/components/work-orders/WorkOrderAssignmentCard';
import { BulkShipByDialog } from '@/components/dashboard/BulkShipByDialog';
import { BulkFlagDialog } from '@/components/dashboard/BulkFlagDialog';
import type { OrderRowFlagId } from '@/lib/orders/order-row-flags';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { OutboundDocumentsResponse } from '@/lib/documents/types';
import type { ShippedOrder } from '@/types/orders';
import type { SelectionAction } from '@/lib/selection/selection-actions';
// Lazy: the product-label printer drags the bwip-js barcode engine (~250 KB gz)
// into whatever bundle imports it statically — this hook rides in the dashboard
// page graph, and printing only happens on an explicit bulk action.
const loadProductLabelPrinter = () => import('@/lib/print/printProductLabel');
import { toast } from '@/lib/toast';
import { requestConfirm } from '@/design-system/components/confirm';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';
import { refreshDomain } from '@/lib/refresh/bus';

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

/**
 * Legacy clipboard write for non-secure contexts (plain-HTTP LAN). Deprecated
 * in the spec but universally implemented, and the only path available when
 * `navigator.clipboard` is absent. Returns false when even this is refused.
 */
function copyViaExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Off-screen but focusable — `display:none` would make the selection fail.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);
    return copied;
  } catch {
    return false;
  }
}

export interface DashboardBulkSelection {
  /** True on the surfaces that support selection (Unshipped / Packed / Shipped). */
  selectionEnabled: boolean;
  /** Always true when selectionEnabled — left-gutter checkboxes stay live. */
  selectMode: boolean;
  /** The currently checked rows for the shared dashboard scope. */
  selectedRows: DashSelectableRow[];
  /** Lifecycle-scoped bulk actions for the contextual selection bar. */
  selectionActions: SelectionAction<DashSelectableRow>[];
  /** Modal surfaces some actions open (assignment carousel, ship-by picker).
   *  The page renders this beside the bar — never inside the capsule. */
  selectionOverlays: ReactNode;
  /**
   * True while the pinned capsule is actually on screen. Bounded table hosts
   * thread this into `workbenchTableViewportClass({ bulkBarInset })` so their
   * last row clears it. Derived HERE rather than at each page so the bar's
   * visibility and the space reserved for it can never disagree.
   */
  bulkBarVisible: boolean;
}

export function useDashboardBulkSelection(
  orderView: DashboardOrderView,
): DashboardBulkSelection {
  const searchParams = useSearchParams();
  const domain = getDashboardDomainFromSearch(searchParams);
  const selectionEnabled = true;
  // Packed reuses the shipped row/delete path (packer records with packed_at).
  const isShippedView = orderView === 'shipped' || orderView === 'packed';
  /**
   * Which actions this lane supports, from the contextual SoT — so the bar, the
   * inspector, and the specs read one list instead of three copies of the same
   * `isPrePack` / `isPostPack` arithmetic.
   */
  const laneActionKeys = useMemo(() => new Set(orderBulkActionKeys(orderView)), [orderView]);
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
  //
  // The DOMAIN switch clears too (dashboard IA rework 2.4): outbound rows are
  // sales orders and inbound rows are receiving cartons, so a live multi-select
  // does not survive the crossing. Carrying it would leave the selection bar
  // offering "print a shipping label" over a set of cartons — the ids would
  // even resolve, against the wrong table. Clearing is the only safe answer for
  // a scope whose rows change entity.
  useEffect(() => {
    clearSelection();
  }, [orderView, domain, clearSelection]);

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
    const ok = () => toast.success(`Copied ${rows.length} row${rows.length === 1 ? '' : 's'}`);
    // `navigator.clipboard` is undefined outside a secure context — which is
    // exactly how the floor reaches this app (plain-HTTP LAN host). The old
    // `navigator.clipboard?.writeText(…).then(…)` short-circuited the WHOLE
    // chain there: no copy, no toast, no error. The button looked broken
    // because it silently was.
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(ok, () => {
        if (!copyViaExecCommand(text)) toast.error('Copy failed');
        else ok();
      });
      return;
    }
    if (copyViaExecCommand(text)) ok();
    else toast.error('Copy is unavailable on this connection — select the text manually');
  }, []);

  // ─── Assign tester / packer ────────────────────────────────────────────────
  // Composes the existing multi-row carousel (prev/next + confirm→advance), NOT
  // a batch-edit "mixed values" panel: assignment is a per-order judgement, and
  // the card already models exactly that walk.
  const [assignmentRows, setAssignmentRows] = useState<WorkOrderRow[]>([]);
  const { technicianOptions, packerOptions, loadStaff, confirmAssignment } =
    useWorkOrderAssignment();

  const handleAssign = useCallback(
    async (rows: DashSelectableRow[]) => {
      if (rows.length === 0) return;
      // loadStaff() toasts its own failure; returning quietly here would leave
      // the operator with an unexplained no-op after the roster fetch died.
      if (!(await loadStaff())) return;
      // Pre-pack rows broadcast the full `ShippedOrder`; the narrow
      // DashSelectableRow type is just what the BAR needs to render.
      setAssignmentRows(rows.map((row) => buildAssignmentRow(row as unknown as ShippedOrder)));
    },
    [loadStaff],
  );

  // ─── Bulk ship-by ──────────────────────────────────────────────────────────
  const [shipByOpen, setShipByOpen] = useState(false);
  const [isSavingShipBy, setIsSavingShipBy] = useState(false);
  const assignOrder = useOrderAssignment();

  const handleSetShipBy = useCallback(() => setShipByOpen(true), []);

  const handleConfirmShipBy = useCallback(
    async (dateKey: string) => {
      const orderIds = selectedRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
      if (orderIds.length === 0) return;
      setIsSavingShipBy(true);
      try {
        // One request for the whole set — the assign waist already takes orderIds[].
        await assignOrder.mutateAsync({ orderIds, shipByDate: dateKey });
        toast.success(
          orderIds.length === 1 ? 'Ship-by date set' : `Ship-by date set on ${orderIds.length} orders`,
        );
        setShipByOpen(false);
        clearSelection();
        refreshDomain('orders.outbound');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not set the ship-by date');
      } finally {
        setIsSavingShipBy(false);
      }
    },
    [assignOrder, clearSelection, selectedRows],
  );

  // ─── Bulk triage flag ──────────────────────────────────────────────────────
  const [flagOpen, setFlagOpen] = useState(false);
  const [isSavingFlag, setIsSavingFlag] = useState(false);

  const handleSetFlag = useCallback(() => setFlagOpen(true), []);

  const handleConfirmFlag = useCallback(
    async (flag: OrderRowFlagId | null) => {
      const orderIds = selectedRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
      if (orderIds.length === 0) return;
      setIsSavingFlag(true);
      try {
        // One request for the whole set. The server reports which ids it
        // actually owned, so a stale selection reports honestly instead of
        // claiming it flagged rows that had already left the queue.
        const res = await fetch('/api/orders/bulk-flag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderIds, flag }),
        });
        if (!res.ok) throw new Error(`bulk-flag ${res.status}`);
        const data = (await res.json()) as { updatedIds?: number[] };
        const n = data.updatedIds?.length ?? orderIds.length;
        toast.success(
          flag === null
            ? n === 1 ? 'Flag cleared' : `Flag cleared on ${n} orders`
            : n === 1 ? 'Row flagged' : `${n} rows flagged`,
        );
        setFlagOpen(false);
        clearSelection();
        refreshDomain('orders.outbound');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not set the flag');
      } finally {
        setIsSavingFlag(false);
      }
    },
    [clearSelection, selectedRows],
  );

  // ─── Print shipping labels (post-pack) ─────────────────────────────────────
  const handlePrintShippingLabels = useCallback(async (rows: DashSelectableRow[]) => {
    const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) return;

    // Each order degrades on its own — one unreachable document must not cost
    // the operator the whole print run.
    const settled = await Promise.allSettled(
      ids.map(async (id) => {
        const res = await fetch(`/api/orders/${id}/documents`);
        if (!res.ok) throw new Error(`documents ${id}`);
        const data = (await res.json()) as OutboundDocumentsResponse;
        return (data.documents ?? []).filter((d) => d.documentType === 'shipping_label');
      }),
    );

    const docs: PrintableOutboundDocument[] = settled
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .map((d) => ({ id: d.id, isPdf: isPdfOutboundDocument(d) }));

    if (docs.length === 0) {
      // "No labels" and "the documents endpoint failed" are different problems
      // for the operator — one is a data gap, the other is retryable.
      const unreachable = settled.filter((r) => r.status === 'rejected').length;
      toast.error(
        unreachable === ids.length
          ? 'Could not read the shipping documents — retry in a moment'
          : 'No shipping labels on the selected order(s)',
      );
      return;
    }
    // The printer takes the whole array — one job, not one dialog per order.
    printOutboundDocuments(docs);
    const missing = ids.length - docs.length;
    if (missing > 0) toast(`Printing ${docs.length}; ${missing} had no label`);
  }, []);

  const handlePrintLabels = useCallback((rows: DashSelectableRow[]) => {
    void loadProductLabelPrinter()
      .then(({ printProductLabel, printProductLabels }) => {
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
      })
      // The label printer is a lazy chunk (bwip-js). A failed chunk fetch — a
      // stale deploy, an offline floor tablet — otherwise rejects into nothing
      // and the operator just sees a button that does not print.
      .catch(() => toast.error('Could not load the label printer — reload and retry'));
  }, []);

  // ─── Export CSV ────────────────────────────────────────────────────────────
  // Client-side only: the rows are already in hand, so a round trip would just
  // be a second definition of "what this lane contains" and a chance for the
  // file to disagree with the screen it was exported from.
  const handleExportCsv = useCallback(
    (rows: DashSelectableRow[]) => {
      if (rows.length === 0) return;
      try {
        // Pre-pack lanes broadcast the full `ShippedOrder`; the narrow
        // DashSelectableRow type is only what the BAR needs to render.
        const csv = buildOrderExportCsv(rows as unknown as ExportableOrderRow[]);
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = orderExportFilename(orderView === 'unshipped' ? 'pending' : orderView);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`);
      } catch {
        toast.error('Could not build the export — retry in a moment');
      }
    },
    [orderView],
  );

  const handleDelete = useCallback(
    async (rows: DashSelectableRow[]) => {
      if (rows.length === 0) return;
      const noun = isShippedView ? 'shipped record' : 'order';
      const label = rows.length === 1 ? `this ${noun}` : `these ${rows.length} ${noun}s`;
      const ok = await requestConfirm({
        description: `Delete ${label}? This cannot be undone.`,
        tone: 'danger',
        confirmLabel: 'Delete',
      });
      if (!ok) return;
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
        refreshDomain('orders.outbound');
      }
    },
    [isShippedView, deleteOrderRow, clearSelection],
  );

  const selectionActions = useMemo<SelectionAction<DashSelectableRow>[]>(
    () => [
      { key: 'copy', label: 'Copy details', icon: <Copy className="h-4 w-4" />, tone: 'blue', primary: true, run: handleCopyDetails },
      {
        key: 'assign',
        label: 'Assign tester / packer',
        icon: <User className="h-4 w-4" />,
        // Pre-pack only: assigning a tester to an order that already shipped is
        // not a thing an operator ever means to do.
        enabled: () => laneActionKeys.has('assign'),
        run: handleAssign,
      },
      {
        key: 'ship-by',
        label: 'Set ship-by date',
        icon: <CalendarIcon className="h-4 w-4" />,
        enabled: () => laneActionKeys.has('ship-by'),
        run: handleSetShipBy,
      },
      {
        key: 'print',
        // PRODUCT labels (SKU + serial) — the physical-prep label, so it belongs
        // where prep happens. Distinct from the shipping label below; the two
        // used to be conflated under one "Print labels" button on every lane.
        label: 'Print product labels',
        icon: <Printer className="h-4 w-4" />,
        enabled: () => laneActionKeys.has('print'),
        run: handlePrintLabels,
      },
      {
        key: 'print-shipping',
        label: 'Print shipping labels',
        icon: <FileText className="h-4 w-4" />,
        enabled: () => laneActionKeys.has('print-shipping'),
        run: handlePrintShippingLabels,
      },
      {
        key: 'flag',
        label: 'Flag rows',
        icon: <Flag className="h-4 w-4" />,
        // Every lane: a shipped order can still be Damaged. The tag annotates
        // the record, it is not a step in the pipeline.
        enabled: () => laneActionKeys.has('flag'),
        run: handleSetFlag,
      },
      {
        key: 'export',
        label: 'Export CSV',
        icon: <Download className="h-4 w-4" />,
        // Reads the selected rows only — meaningful on every lane.
        enabled: () => laneActionKeys.has('export'),
        run: handleExportCsv,
      },
      { key: 'delete', label: 'Delete', icon: <Trash2 className="h-4 w-4" />, tone: 'red', run: handleDelete },
    ],
    [
      handleCopyDetails,
      handleAssign,
      handleSetShipBy,
      handleSetFlag,
      handlePrintLabels,
      handlePrintShippingLabels,
      handleExportCsv,
      handleDelete,
      laneActionKeys,
    ],
  );

  // Overlays the actions open. Rendered by the page beside the selection bar —
  // they are modal surfaces, so they must not live inside the bar's capsule.
  const selectionOverlays = (
    <>
      {assignmentRows.length > 0 ? (
        <WorkOrderAssignmentCard
          rows={assignmentRows}
          startIndex={0}
          technicianOptions={technicianOptions}
          packerOptions={packerOptions}
          onConfirm={confirmAssignment}
          onClose={() => setAssignmentRows([])}
          closeWhenCompleted
        />
      ) : null}
      <BulkShipByDialog
        open={shipByOpen}
        count={selectedRows.length}
        saving={isSavingShipBy}
        onCancel={() => setShipByOpen(false)}
        onConfirm={handleConfirmShipBy}
      />
      <BulkFlagDialog
        open={flagOpen}
        count={selectedRows.length}
        saving={isSavingFlag}
        onCancel={() => setFlagOpen(false)}
        onConfirm={handleConfirmFlag}
      />
    </>
  );

  // Mirrors ContextualSelectionBar's own mount condition (`visible` defaults to
  // count > 0, and it renders null when no action can fire).
  const bulkBarVisible =
    selectionEnabled && selectedRows.length > 0 && selectionActions.length > 0;

  return {
    selectionEnabled,
    selectMode,
    selectedRows,
    selectionActions,
    selectionOverlays,
    bulkBarVisible,
  };
}
