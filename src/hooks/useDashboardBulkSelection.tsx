'use client';

/**
 * Dashboard bulk-selection for the Unshipped / Packed / Shipped order tables.
 *
 * The tables share one selection scope (only one mounts per `?view`); FBA opts
 * out. Selection is always on when the surface supports it — left-gutter
 * checkboxes + column select-all, no chrome pencil. This hook owns the clear-
 * on-view-flip resets and the bulk actions. The floating action bar is rendered
 * by the page from `selectionActions`; overlays those actions open (the
 * one-shot assign picker, condition / qty / notes / ship-by dialogs) come
 * back as `selectionOverlays`.
 *
 * Right-rail publishers wrap this via {@link useOrderRailSelection} — do not
 * add a publish flag here. Surfaces that still need a floating capsule (none of
 * the order queues) would call this hook directly; Pack / Shipping / dashboard
 * all publish through the wrapper.
 *
 * **Actions diverge by lifecycle stage, layout does not** (the house rule these
 * lanes are built on). All four outbound tabs render one grid component with one
 * persisted column layout, but "assign a tester" is meaningless on Shipped and
 * "print a shipping label" is meaningless on Pending — so every action declares
 * the views it belongs to via `enabled`, and the rail action region drops the
 * ones that cannot fire instead of showing dead buttons.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bookmark, Calendar as CalendarIcon, Copy, Download, FileText, Flag, Hash, Image, Link2, Printer, ShippingModeScanOut, Tag, Trash2, User } from '@/components/Icons';
import { useTableSelection } from '@/hooks/useTableSelection';
import { useDeleteOrderRow } from '@/hooks/useDeleteOrderRow';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { getActiveStaff } from '@/lib/staffCache';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';
import { isPdfOutboundDocument } from '@/lib/documents/outbound-document-display';
import { printOutboundDocuments, type PrintableOutboundDocument } from '@/lib/print/printOutboundDocuments';
import {
  buildOrderExportCsv,
  orderExportFilename,
  type ExportableOrderRow,
} from '@/lib/dashboard/order-export-csv';
import {
  canScanOut,
  hasShippingPaperwork,
  isInBuilding,
  scanOutDirection,
  shipmentIdForScanOut,
  trackingForScanOut,
} from '@/lib/selection/order-verb-state';
import { ORDERS_FIELD_CATALOG } from '@/lib/tables/field-catalog/orders';
import { BulkConditionDialog } from '@/components/dashboard/BulkConditionDialog';
import { BulkQtyDialog } from '@/components/dashboard/BulkQtyDialog';
import { BulkNotesDialog } from '@/components/dashboard/BulkNotesDialog';
import { BulkShipByDialog } from '@/components/dashboard/BulkShipByDialog';
import { BulkFlagDialog } from '@/components/dashboard/BulkFlagDialog';
import { ListingAutomationAssignCard } from '@/components/dashboard/ListingAutomationAssignCard';
import { LinkLabelDialog } from '@/components/outbound/orders/LinkLabelDialog';
import { openStageAssignPanel } from '@/lib/tables/stage-assign-panel-store';
import type { OrderRowFlagId } from '@/lib/orders/order-row-flags';
import type { ConditionGrade } from '@/lib/conditions';
import type { OutboundDocumentsResponse } from '@/lib/documents/types';
import {
  offeredSelectionActions,
  type SelectionAction,
  type VerbDirection,
} from '@/lib/selection/selection-actions';
// Lazy: the product-label printer drags the bwip-js barcode engine (~250 KB gz)
// into whatever bundle imports it statically — this hook rides in the dashboard
// page graph, and printing only happens on an explicit bulk action.
const loadProductLabelPrinter = () => import('@/lib/print/printProductLabel');
import { toast } from '@/lib/toast';
import { requestConfirm } from '@/design-system/components/confirm';
import type { DashboardOrderView } from '@/utils/dashboard-search-state';
import { refreshDomain } from '@/lib/refresh/bus';
import { optimisticallyRemoveOrderRows } from '@/lib/queries/order-cache-optimistic';

/**
 * Minimal shape the dashboard selection bar needs from a row — satisfied by
 * both the Unshipped (`ShippedOrder`) and Shipped (`PackerRecord`) records.
 */
type DashSelectableRow = {
  id: number | string;
  order_id?: string | null;
  sku?: string | null;
  serial_number?: string | null;
  shipping_tracking_number?: string | null;
  tracking_number?: string | null;
  packer_log_id?: number | null;
  catalog_image_url?: string | null;
  packed_at?: string | null;
  ship_confirmed_at?: string | null;
  latest_status_category?: string | null;
  is_terminal?: boolean | null;
  shipment_id?: number | string | null;
  is_urgent?: boolean | null;
};

/** Urgent is ONE reversible verb: mark when the row is not urgent, clear when it is. */
function urgentDirection(row: DashSelectableRow): VerbDirection {
  return row.is_urgent ? 'undo' : 'do';
}

/**
 * The facts every orders mount can RESOLVE for its rows — the whole family
 * catalog. Painting a column is a layout decision (To-ship refuses to paint
 * `Scanned out`); being able to ACT on a fact the row carries is not.
 */
const ORDERS_RESOLVABLE_FIELD_IDS = ORDERS_FIELD_CATALOG.map((f) => f.id);

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
  /** Modal surfaces some actions open (one-shot assign, condition, qty, notes, ship-by).
   *  The page renders this beside the rail — never inside a selection capsule. */
  selectionOverlays: ReactNode;
}

export function useDashboardBulkSelection(
  orderView: DashboardOrderView,
): DashboardBulkSelection {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const domain = getDashboardDomainFromSearch(searchParams);
  const selectionEnabled = true;
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

  // The rows a DIALOG verb was run WITH. The catalog is offered at n=1 too
  // (the Selected-order column runs a verb on the open record without it being
  // checked), so a dialog must confirm against the rows it was opened for —
  // not whatever the check-set holds. Null = no dialog verb in flight; the
  // table bar passes the check-set itself, so its behaviour is unchanged.
  const [dialogRows, setDialogRows] = useState<DashSelectableRow[] | null>(null);
  const targetRows = dialogRows ?? selectedRows;
  // Link label pairs ONE order with a ShipStation label (return / replacement /
  // outbound bought outside) — the row it was run on, not the check-set.
  const [linkLabelRow, setLinkLabelRow] = useState<DashSelectableRow | null>(null);

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

  const handleDownloadPhotos = useCallback((rows: DashSelectableRow[]) => {
    const urls = [
      ...new Set(
        rows
          .map((r) => String(r.catalog_image_url || '').trim())
          .filter(Boolean),
      ),
    ];
    if (urls.length === 0) {
      toast.error('No photos on the selected row(s)');
      return;
    }
    for (const url of urls) {
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.rel = 'noopener';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    toast.success(urls.length === 1 ? 'Downloading photo' : `Downloading ${urls.length} photos`);
  }, []);

  /*
   * Scale confirmation for a write that fans out over a selection.
   *
   * Ship-by and Flag already open a picker, so they were never "one click with
   * no dialog" — but the picker asks WHAT VALUE, never HOW MANY ROWS. An
   * operator who picked a date saw a date, hit save, and moved the ship-by on
   * every row they happened to still have checked, with a toast as the first
   * mention of the count. On a desk whose whole job is meeting ship-by dates,
   * that is the one number the dialog had to say out loud.
   *
   * Below the threshold it stays a single gesture: a confirm on three rows the
   * operator can see is a click tax, and a dialog that always appears is a
   * dialog nobody reads by the end of a shift. Delete keeps its own unscaled
   * confirm — destruction is not a matter of degree.
   */
  const BULK_CONFIRM_THRESHOLD = 5;
  const BULK_WRITE_CAP = 500;
  const confirmBulkWrite = useCallback(async (count: number, verb: string) => {
    if (count < BULK_CONFIRM_THRESHOLD) return true;
    return requestConfirm({
      description: `${verb} on ${count} orders?`,
      confirmLabel: `Apply to ${count}`,
      tone: 'primary',
    });
  }, []);

  const selectedOrderIds = useCallback(() => {
    const ids = targetRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
    if (ids.length > BULK_WRITE_CAP) {
      toast.error(`Select at most ${BULK_WRITE_CAP} orders`);
      return [];
    }
    return ids;
  }, [targetRows]);

  // ─── Staff roster (listing-rule overlay) + stage assign opens via column foot ─
  const [listingRuleOrderIds, setListingRuleOrderIds] = useState<number[]>([]);
  const [staffOptions, setStaffOptions] = useState<{ id: number; name: string }[]>([]);
  const assignOrder = useOrderAssignment();

  const loadStaff = useCallback(async (): Promise<boolean> => {
    try {
      const members = await getActiveStaff();
      setStaffOptions(
        members
          .map((m) => ({ id: Number(m.id), name: String(m.name || '').trim() }))
          .filter((m) => Number.isFinite(m.id) && m.id > 0 && m.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      return true;
    } catch {
      toast.error('Failed to load staff');
      return false;
    }
  }, []);

  const handleListingRule = useCallback(
    async (rows: DashSelectableRow[]) => {
      if (rows.length === 0) return;
      if (!(await loadStaff())) return;
      const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length === 0) return;
      setListingRuleOrderIds(ids);
    },
    [loadStaff],
  );

  // ─── Bulk ship-by ──────────────────────────────────────────────────────────
  const [shipByOpen, setShipByOpen] = useState(false);
  const [isSavingShipBy, setIsSavingShipBy] = useState(false);

  const handleSetShipBy = useCallback((rows: DashSelectableRow[]) => {
    setDialogRows(rows.length > 0 ? rows : null);
    setShipByOpen(true);
  }, []);

  const handleConfirmShipBy = useCallback(
    async (dateKey: string) => {
      const orderIds = selectedOrderIds();
      if (orderIds.length === 0) return;
      if (!(await confirmBulkWrite(orderIds.length, `Set the ship-by date to ${dateKey}`))) return;
      setIsSavingShipBy(true);
      try {
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
    [assignOrder, clearSelection, confirmBulkWrite, selectedOrderIds],
  );

  // ─── Bulk condition / qty / notes ──────────────────────────────────────────
  const [conditionOpen, setConditionOpen] = useState(false);
  const [isSavingCondition, setIsSavingCondition] = useState(false);
  const [qtyOpen, setQtyOpen] = useState(false);
  const [isSavingQty, setIsSavingQty] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const handleConfirmCondition = useCallback(
    async (condition: ConditionGrade) => {
      const orderIds = selectedOrderIds();
      if (orderIds.length === 0) return;
      if (!(await confirmBulkWrite(orderIds.length, `Set condition to ${condition}`))) return;
      setIsSavingCondition(true);
      try {
        await assignOrder.mutateAsync({ orderIds, condition });
        toast.success(
          orderIds.length === 1 ? 'Condition set' : `Condition set on ${orderIds.length} orders`,
        );
        setConditionOpen(false);
        clearSelection();
        refreshDomain('orders.outbound');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not set the condition');
      } finally {
        setIsSavingCondition(false);
      }
    },
    [assignOrder, clearSelection, confirmBulkWrite, selectedOrderIds],
  );

  const handleConfirmQty = useCallback(
    async (quantity: string) => {
      const orderIds = selectedOrderIds();
      if (orderIds.length === 0) return;
      if (!(await confirmBulkWrite(orderIds.length, `Set quantity to ${quantity}`))) return;
      setIsSavingQty(true);
      try {
        await assignOrder.mutateAsync({ orderIds, quantity });
        toast.success(
          orderIds.length === 1 ? 'Quantity set' : `Quantity set on ${orderIds.length} orders`,
        );
        setQtyOpen(false);
        clearSelection();
        refreshDomain('orders.outbound');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not set the quantity');
      } finally {
        setIsSavingQty(false);
      }
    },
    [assignOrder, clearSelection, confirmBulkWrite, selectedOrderIds],
  );

  const handleConfirmNotes = useCallback(
    async (noteText: string) => {
      const orderIds = selectedOrderIds();
      if (orderIds.length === 0) return;
      if (!(await confirmBulkWrite(orderIds.length, 'Add the note'))) return;
      setIsSavingNotes(true);
      try {
        const res = await fetch('/api/orders/notes/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderIds, noteText }),
        });
        if (!res.ok) throw new Error(`bulk-notes ${res.status}`);
        const data = (await res.json()) as { updatedIds?: number[] };
        const n = data.updatedIds?.length ?? orderIds.length;
        toast.success(n === 1 ? 'Note added' : `Note added on ${n} orders`);
        setNotesOpen(false);
        clearSelection();
        refreshDomain('orders.outbound');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not add the note');
      } finally {
        setIsSavingNotes(false);
      }
    },
    [clearSelection, confirmBulkWrite, selectedOrderIds],
  );

  // ─── Bulk triage flag ──────────────────────────────────────────────────────
  const [flagOpen, setFlagOpen] = useState(false);
  const [isSavingFlag, setIsSavingFlag] = useState(false);

  const handleSetFlag = useCallback((rows: DashSelectableRow[]) => {
    setDialogRows(rows.length > 0 ? rows : null);
    setFlagOpen(true);
  }, []);

  // Every dialog closed → the next verb targets the check-set again.
  useEffect(() => {
    if (!conditionOpen && !qtyOpen && !notesOpen && !shipByOpen && !flagOpen) setDialogRows(null);
  }, [conditionOpen, qtyOpen, notesOpen, shipByOpen, flagOpen]);

  const handleConfirmFlag = useCallback(
    async (flag: OrderRowFlagId | null) => {
      const orderIds = selectedOrderIds();
      if (orderIds.length === 0) return;
      if (!(await confirmBulkWrite(orderIds.length, flag === null ? 'Clear the flag' : 'Flag')))
        return;
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
    [clearSelection, confirmBulkWrite, selectedOrderIds],
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

  // ─── Urgent (one verb, two directions) ─────────────────────────────────────
  // `orders.is_urgent` drives the URG lifecycle state; the write rides the one
  // order-assign path (optimistic cache + fulfillment cache bust).
  const handleSetUrgent = useCallback(
    async (rows: DashSelectableRow[], resolved?: { direction: VerbDirection }) => {
      const direction = resolved?.direction ?? 'do';
      const orderIds = rows
        .filter((r) => urgentDirection(r) === direction)
        .map((r) => Number(r.id))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (orderIds.length === 0) return;
      const want = direction === 'do';
      try {
        await assignOrder.mutateAsync({ orderIds, isUrgent: want });
        toast.success(
          want
            ? orderIds.length === 1 ? 'Marked urgent' : `${orderIds.length} orders marked urgent`
            : orderIds.length === 1 ? 'Urgent cleared' : `Urgent cleared on ${orderIds.length} orders`,
        );
        refreshDomain('orders.outbound');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not update urgency');
      }
    },
    [assignOrder],
  );

  // ─── Print paperwork (browser fallback — the print station is down) ────────
  // Label · slip · manuals for every selected order, pack order, ONE dialog.
  // The server ledgers each page as `fallback_browser` in document_print_jobs.
  const handlePrintPaperwork = useCallback(async (rows: DashSelectableRow[]) => {
    const ids = rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return;
    try {
      const { printPaperworkPackets, describePaperworkPrint } = await import('@/lib/print/printPaperworkPackets');
      const verdict = describePaperworkPrint(await printPaperworkPackets(ids));
      if (verdict.ok) toast.success(verdict.message);
      else toast.error(verdict.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not print the paperwork');
    }
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

  /**
   * The dock scan-out, both directions.
   *
   * `direction` was resolved from the ROWS before the operator pressed it
   * (majority; the remainder was named in the tooltip), so this applies that
   * one direction and skips the rows it does not cover rather than silently
   * doing two different things to one selection. POST records the SHIP_CONFIRM,
   * DELETE removes it — the same pair the dock station uses.
   */
  const handleScanOut = useCallback(
    async (rows: DashSelectableRow[], resolved?: { direction: VerbDirection }) => {
      const direction: VerbDirection = resolved?.direction ?? 'do';
      const actionable = rows.filter(
        (row) => scanOutDirection(row) === direction && canScanOut(row, direction),
      );
      if (actionable.length === 0) {
        toast.error(
          direction === 'undo'
            ? 'No scanned-out rows to undo in the selection'
            : 'No shipping label on the selected row(s)',
        );
        return;
      }
      const verb = direction === 'undo' ? 'Undo the scan-out' : 'Mark scanned out';
      if (!(await confirmBulkWrite(actionable.length, verb))) return;

      const results = await Promise.allSettled(
        actionable.map(async (row) => {
          const res = await fetch('/api/shipped/scan-out', {
            method: direction === 'undo' ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              direction === 'undo'
                ? { shipmentId: shipmentIdForScanOut(row) }
                : { trackingNumber: trackingForScanOut(row) },
            ),
          });
          if (!res.ok) throw new Error(`scan-out ${res.status}`);
          const body = (await res.json()) as {
            matched?: boolean;
            blocked?: boolean;
            alreadyDelivered?: boolean;
            message?: string;
          };
          if (body?.matched === false) throw new Error('no shipment for this label');
          if (body?.blocked) throw new Error(body.message || 'cancelled — do not ship');
          if (body?.alreadyDelivered) throw new Error(body.message || 'already delivered');
          return row;
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = results.length - failed;
      const succeededOrderIds = results
        .filter((result): result is PromiseFulfilledResult<DashSelectableRow> => result.status === 'fulfilled')
        .map((result) => Number(result.value.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (succeededOrderIds.length > 0) {
        optimisticallyRemoveOrderRows(queryClient, succeededOrderIds);
      }
      if (ok > 0) {
        toast.success(
          direction === 'undo'
            ? ok === 1 ? 'Scan-out undone' : `Scan-out undone on ${ok} orders`
            : ok === 1 ? 'Marked as shipped' : `${ok} orders marked as shipped`,
        );
      }
      if (failed > 0) toast.error(`${failed} of ${results.length} could not be updated`);
      clearSelection();
      refreshDomain('orders.outbound');
    },
    [clearSelection, confirmBulkWrite, queryClient],
  );

  /**
   * The family verb CATALOG — declared once, here, for every orders surface.
   * What each verb may do is a predicate over the selected ROWS; where it is
   * offered is {@link SelectionAction.writesField}. Neither reads the route.
   */
  const verbCatalog = useMemo<SelectionAction<DashSelectableRow>[]>(
    () => [
      {
        key: 'download-photos',
        label: 'Download photos',
        icon: <Image className="h-4 w-4" />,
        group: 'Take away',
        run: handleDownloadPhotos,
      },
      { key: 'copy', label: 'Copy details', icon: <Copy className="h-4 w-4" />, tone: 'blue', primary: true, group: 'Take away', run: handleCopyDetails },
      {
        key: 'assign-pick',
        label: 'Assign pick',
        icon: <User className="h-4 w-4" />,
        group: 'Set on these orders',
        writesField: 'orders.picked',
        enabled: (rows) => rows.some(isInBuilding),
        disabledReason: 'These orders have already left the floor',
        run: async () => {
          openStageAssignPanel('pick');
        },
      },
      {
        key: 'assign-pack',
        label: 'Assign pack',
        icon: <User className="h-4 w-4" />,
        group: 'Set on these orders',
        writesField: 'orders.packed',
        enabled: (rows) => rows.some(isInBuilding),
        disabledReason: 'These orders have already left the floor',
        run: async () => {
          openStageAssignPanel('pack');
        },
      },
      {
        key: 'condition',
        label: 'Set condition',
        icon: <Tag className="h-4 w-4" />,
        group: 'Set on these orders',
        writesField: 'orders.condition',
        enabled: (rows) => rows.some(isInBuilding),
        disabledReason: 'These orders have already left the floor',
        run: (rows) => {
          setDialogRows(rows.length > 0 ? rows : null);
          setConditionOpen(true);
        },
      },
      {
        key: 'qty',
        label: 'Set quantity',
        icon: <Hash className="h-4 w-4" />,
        group: 'Set on these orders',
        writesField: 'orders.qty',
        enabled: (rows) => rows.some(isInBuilding),
        disabledReason: 'These orders have already left the floor',
        run: (rows) => {
          setDialogRows(rows.length > 0 ? rows : null);
          setQtyOpen(true);
        },
      },
      {
        key: 'notes',
        label: 'Add note',
        icon: <FileText className="h-4 w-4" />,
        group: 'Set on these orders',
        writesField: 'orders.notes',
        run: (rows) => {
          setDialogRows(rows.length > 0 ? rows : null);
          setNotesOpen(true);
        },
      },
      {
        key: 'listing-rule',
        label: 'Listing → staff rule',
        icon: <Bookmark className="h-4 w-4" />,
        group: 'Set on these orders',
        enabled: (rows) => rows.some(isInBuilding),
        disabledReason: 'These orders have already left the floor',
        run: handleListingRule,
      },
      {
        key: 'ship-by',
        label: 'Set ship-by date',
        icon: <CalendarIcon className="h-4 w-4" />,
        group: 'Set on these orders',
        enabled: (rows) => rows.some(isInBuilding),
        disabledReason: 'These orders have already left the floor',
        run: handleSetShipBy,
      },
      {
        key: 'print',
        label: 'Print product labels',
        icon: <Printer className="h-4 w-4" />,
        group: 'Take away',
        enabled: (rows) => rows.some(isInBuilding),
        disabledReason: 'These orders have already left the floor',
        run: handlePrintLabels,
      },
      {
        key: 'print-shipping',
        label: 'Print shipping labels',
        icon: <FileText className="h-4 w-4" />,
        group: 'Take away',
        enabled: (rows) => rows.some(hasShippingPaperwork),
        disabledReason: 'No shipping document until the order is packed',
        run: handlePrintShippingLabels,
      },
      {
        key: 'urgent',
        label: 'Urgent',
        icon: <AlertTriangle className="h-4 w-4" />,
        group: 'Set on these orders',
        direction: urgentDirection,
        directionLabels: { do: 'Mark urgent', undo: 'Clear urgent' },
        run: handleSetUrgent,
      },
      {
        key: 'print-paperwork',
        label: 'Print paperwork',
        icon: <Printer className="h-4 w-4" />,
        group: 'Take away',
        run: handlePrintPaperwork,
      },
      {
        key: 'link-label',
        label: 'Link label',
        icon: <Link2 className="h-4 w-4" />,
        group: 'Set on these orders',
        maxSelected: 1,
        disabledReason: 'Link a label to one order at a time',
        run: (rows) => setLinkLabelRow(rows[0] ?? null),
      },
      {
        key: 'scan-out',
        label: 'Scan out',
        icon: <ShippingModeScanOut className="h-4 w-4" />,
        group: 'Set on these orders',
        writesField: 'orders.scanned_out',
        direction: scanOutDirection,
        directionLabels: { do: 'Mark scanned out', undo: 'Undo scan-out' },
        enabled: (rows) => rows.some((r) => canScanOut(r, scanOutDirection(r))),
        disabledReason: 'No label or shipment on the selected row(s)',
        run: handleScanOut,
      },
      {
        key: 'flag',
        label: 'Flag rows',
        icon: <Flag className="h-4 w-4" />,
        group: 'Set on these orders',
        run: handleSetFlag,
      },
      {
        key: 'export',
        label: 'Export CSV',
        icon: <Download className="h-4 w-4" />,
        group: 'Take away',
        run: handleExportCsv,
      },
      { key: 'delete', label: 'Delete', icon: <Trash2 className="h-4 w-4" />, tone: 'red', run: handleDelete },
    ],
    [
      handleDownloadPhotos,
      handleCopyDetails,
      handleListingRule,
      handleSetShipBy,
      handleSetFlag,
      handlePrintLabels,
      handlePrintShippingLabels,
      handlePrintPaperwork,
      handleSetUrgent,
      handleExportCsv,
      handleDelete,
      handleScanOut,
    ],
  );

  const selectionActions = useMemo(
    () => offeredSelectionActions(verbCatalog, ORDERS_RESOLVABLE_FIELD_IDS),
    [verbCatalog],
  );

  // Overlays the actions open. Rendered by the page beside the selection bar —
  // they are modal surfaces, so they must not live inside the bar's capsule.
  // Pick / Pack assign opens as an upward search under the column-foot icons
  // (no Dialog / Popover).
  const selectionOverlays = (
    <>
      {listingRuleOrderIds.length > 0 ? (
        <ListingAutomationAssignCard
          orderIds={listingRuleOrderIds}
          technicianOptions={staffOptions}
          packerOptions={staffOptions}
          onClose={() => setListingRuleOrderIds([])}
          onComplete={(mode) => {
            clearSelection();
            refreshDomain('orders.outbound');
            toast.success(
              mode === 'save_and_assign'
                ? 'Listing rules saved and orders assigned'
                : 'Existing listing rules applied',
            );
          }}
        />
      ) : null}
      <BulkConditionDialog
        open={conditionOpen}
        count={targetRows.length}
        saving={isSavingCondition}
        onCancel={() => setConditionOpen(false)}
        onConfirm={handleConfirmCondition}
      />
      <BulkQtyDialog
        open={qtyOpen}
        count={targetRows.length}
        saving={isSavingQty}
        onCancel={() => setQtyOpen(false)}
        onConfirm={handleConfirmQty}
      />
      <BulkNotesDialog
        open={notesOpen}
        count={targetRows.length}
        saving={isSavingNotes}
        onCancel={() => setNotesOpen(false)}
        onConfirm={handleConfirmNotes}
      />
      <BulkShipByDialog
        open={shipByOpen}
        count={targetRows.length}
        saving={isSavingShipBy}
        onCancel={() => setShipByOpen(false)}
        onConfirm={handleConfirmShipBy}
      />
      <BulkFlagDialog
        open={flagOpen}
        count={targetRows.length}
        saving={isSavingFlag}
        onCancel={() => setFlagOpen(false)}
        onConfirm={handleConfirmFlag}
      />
      {linkLabelRow ? (
        <LinkLabelDialog
          open
          onOpenChange={(open) => !open && setLinkLabelRow(null)}
          orderId={Number(linkLabelRow.id)}
          orderRef={String(linkLabelRow.order_id ?? '').trim() || `#${linkLabelRow.id}`}
        />
      ) : null}
    </>
  );

  return {
    selectionEnabled,
    selectMode,
    selectedRows,
    selectionActions,
    selectionOverlays,
  };
}
