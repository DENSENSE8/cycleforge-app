'use client';

/** The ORDER verbs — consumer #1 of {@link RecordActionStrip} (owner 2026-09-25: */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives/Button';
import {
  RecordActionStrip,
  type RecordActionVerb,
} from '@/design-system/components/record-action-strip/RecordActionStrip';
import { scopeRecordVerbs } from '@/design-system/components/record-action-strip/record-verb-scope';
import { ORDER_NOUN } from '@/lib/orders/order-card-model';
import { useDeskRecordPlaneOptional } from '@/design-system/components/DeskRecordPlane';
import {
  AlertTriangle,
  Bookmark,
  Copy,
  FileText,
  MapPin,
  Printer,
  Repeat,
  RotateCcw,
  PackageX,
  Tag,
  Ticket,
  Trash2,
  Truck,
  Zap,
} from '@/components/Icons';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { exceptionsQueryKey } from '@/hooks/exceptions';
import { bustFulfillmentCaches, bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { deleteOrdersWithUndo } from '@/lib/orders/deferred-order-delete';
import { afterDismissPaint, hideRecords, markDismissed, restoreRecords } from '@/design-system/components/triage-card-list/dismiss';
import { applyMorphingGutterClick, isMorphingMobileUrl } from '@/lib/outbound/morphing-row-action';
import { rememberRowPlaneOpen } from '@/lib/tables/row-plane';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { dispatchOpenShippedDetails, dispatchOpenListingStaffRules, dispatchOpenOrderPaperwork } from '@/utils/events';
import { OrderNotesTrail } from '@/components/shipped/details-panel/OrderNotesTrail';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  GridRowCheckbox,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { TableRowPlaneProps } from '@/components/tables/table-surface-binding';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { EXCEPTIONS_PATH } from '@/lib/exceptions/types';
import { commitExceptionsItemPaste } from '@/lib/orders/exceptions-cta';
import { SearchField } from '@/design-system/primitives/SearchField';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { useAuth } from '@/contexts/AuthContext';
import { getStaffName } from '@/utils/staff';
import { cn } from '@/utils/_cn';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { StaffPickList } from '@/components/staff-assign/StaffPickList';
import { refreshDomain } from '@/lib/refresh/bus';
import {
  SCAN_OUT_DESK_MAX_BACKDATE_MS,
  SCAN_OUT_DESK_SOURCE,
} from '@/lib/outbound/scan-out-desk-stamp';
import { scanOutDirection, shipmentIdForScanOut, type OutboundVerbRow } from '@/lib/selection/order-verb-state';
import {
  DATA_TABLE_ACTION_ROW_ATTR,
  DATA_TABLE_OVERLAY_HOST_ATTR,
} from '@/components/tables/data-table-overlay-host';
import { useRailActionSnapshot } from '@/components/right-rail/RailSelectionActions';
import { resolveSelectionAction, type SelectionAction } from '@/lib/selection/selection-actions';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { OOS_ORDERS_HREF, showOosPendingToast } from '@/lib/outbound/oos-pending-toast';
import {
  morphingListingIdentity,
  morphingOosAssignPayload,
  morphingOosOrderId,
  morphingOosStartView,
  morphingOosStaysPacked,
  type MorphingOosRow,
} from '@/lib/outbound/morphing-oos';
import type { OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';
import { usePrintPackingSlip } from '@/components/outbound/orders/record-keys/print-slip';
import { ORDER_VERB_HOTKEYS, orderCatalogHotkeys } from '@/components/outbound/orders/record-keys/order-key-table';
import type { KitComposition } from '@/lib/orders/order-kit-composition';
import { VIEW_SPECS, viewOffersVerb, type OrderViewKey } from '@/lib/views/view-specs';
import { OosProductCombobox } from '@/components/outbound/orders/oos/OosProductCombobox';
import { useClearOutOfStock } from '@/components/outbound/orders/oos/useClearOutOfStock';
import { buildRecordTaskVerb } from '@/components/tasks/RecordTaskActions';
import { supportCreateTicketHref } from '@/lib/support/order-support-routes';
import { isOrderShipped } from '@/components/shipped/details-panel/shipped-details-logic';
import { OrderLabelBuyDialog } from '@/components/outbound/labels/OrderLabelBuyDialog';
import { ReturnLabelDialog } from '@/components/outbound/labels/ReturnLabelDialog';
import { pickOrderDocument, useOrderDocuments } from '@/lib/orders/order-paperwork-client';
import { SELECTION_STATUS_BAR_META } from '@/hooks/useSelectionStatusBarHotkeys';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { PairSkuLocationDialog } from './PairSkuLocationDialog';
import { BuyerCancelDialog } from './BuyerCancelDialog';

function orderIdOf(row: unknown): number | null {
  if (!row || typeof row !== 'object' || !('id' in row)) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function trackingOf(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const shipping =
    'shipping_tracking_number' in row ? row.shipping_tracking_number : null;
  const tracking = 'tracking_number' in row ? row.tracking_number : null;
  const raw = String(shipping ?? tracking ?? '').trim();
  return raw || null;
}

function isUrgentRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  if ('is_urgent' in row) return Boolean(row.is_urgent);
  if ('isUrgent' in row) return Boolean(row.isUrgent);
  return false;
}

function isOutOfStockRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  if ('is_out_of_stock' in row) return Boolean(row.is_out_of_stock);
  if ('isOutOfStock' in row) return Boolean(row.isOutOfStock);
  return false;
}

/**
 * Catalog verbs the strip paints as its own primary buttons or displays; the
 * rest of the bulk catalog (`useDashboardBulkSelection`) rides the ⋮ at n=1.
 */
const STRIP_OWNED_CATALOG_KEYS: Record<string, true> = {
  copy: true,
  print: true,
  urgent: true,
  'scan-out': true,
  delete: true,
  'listing-rule': true,
};

/**
 * The verbs that stay as BUTTONS on the table's top strip (owner 2026-09-26):
 * bulk work over the list — Report out of stock, Mark urgent, Mark scanned
 * out, Select, Delete (+ the Exceptions desk's paste / resolve). The rest of
 * one order's actions go behind ⋮ and below the record's details
 * ({@link useOrderRecordMoreVerbs}).
 */
const ORDER_BULK_VERB_IDS: ReadonlySet<string> = new Set([
  'paste',
  'resolve',
  'out-of-stock',
  'urgent',
  'scan-out',
  'select',
  'delete',
]);

/**
 * Verbs the open record already answers INLINE (owner 2026-09-26: "it's all
 * duplicates"): Pick / Pack assign on the stage rows, condition + qty on the
 * item card, ship-by in the details, the rule pencil, and ONE Paperwork
 * action for label · slip · manuals (upload, print and link live there);
 * Flag / Export are list-level, not about one order.
 */
const RECORD_INLINE_VERB_IDS: ReadonlySet<string> = new Set([
  'label',
  'notes',
  'more-info',
  'assign-pick',
  'assign-pack',
  'condition',
  'qty',
  'ship-by',
  'create-rule',
  'listing-rule',
  'print-shipping',
  'print-paperwork',
  'link-label',
  'flag',
  'export',
]);

/** Per-order verbs the desk's check-set strip drops: the open record answers them inline. */
const RAIL_REPLACED_VERB_IDS: ReadonlySet<string> = new Set(['label', 'notes', 'more-info']);

/** Check-set actions in importance order. */
function bulkStripVerbs(verbs: readonly RecordActionVerb[]): RecordActionVerb[] {
  const available = verbs.filter((verb) => !RAIL_REPLACED_VERB_IDS.has(verb.id));
  return [
    ...available.filter((verb) => ORDER_BULK_VERB_IDS.has(verb.id)),
    ...available.filter((verb) => !ORDER_BULK_VERB_IDS.has(verb.id)),
  ];
}

/**
 * Selection actions in importance order. Record-only links follow the shared
 * workflow verbs; destructive actions remain last and overflow automatically.
 */
const TRIAGE_BAR_PRIMARY_IDS: readonly string[] = ['paste', 'resolve', 'out-of-stock', 'buyer-cancelled', 'urgent', 'scan-out', 'documents'];
const TRIAGE_BAR_DROPPED_IDS: ReadonlySet<string> = new Set(['more-info', 'select', 'notes', 'label']);

type AllocateLead = readonly { id: string; face?: Partial<Pick<RecordActionVerb, 'label' | 'tone'>> }[];

/**
 * The allocate record's lead verbs, in order, with the face each wears there
 * (owner 2026-09-29; operator 2026-10-08) — by stage:
 * - shipped on a tracking: the service verbs a caller rings for lead — Buy
 *   replacement label, Return label, Create customer ticket (vivid orange),
 *   then Pair SKU to location, Assign task, Report out of stock.
 * - no tracking linked yet: the order still has to leave — Buy label, Mark
 *   urgent, Pair SKU to location lead; the ticket follows as a plain row.
 */
const ALLOCATE_LEAD_SHIPPED: AllocateLead = [
  { id: 'urgent' },
  { id: 'replacement-label' },
  { id: 'return-label' },
  { id: 'customer-ticket', face: { tone: 'orange' } },
  // Right under the ticket; a filled amber CTA while the SKU has no home location.
  { id: 'pair-sku-location' },
  { id: 'task' },
  { id: 'out-of-stock' },
];
const ALLOCATE_LEAD_UNSHIPPED: AllocateLead = [
  { id: 'buy-label' },
  { id: 'urgent' },
  { id: 'pair-sku-location' },
  { id: 'customer-ticket' },
  { id: 'task' },
  { id: 'out-of-stock' },
  { id: 'return-label' },
];

function triageBarVerbs(record: ShippedOrder, verbs: readonly RecordActionVerb[]): RecordActionVerb[] {
  const byId = new Map(verbs.map((verb) => [verb.id, verb]));
  const primary = TRIAGE_BAR_PRIMARY_IDS.flatMap((id) => {
    const verb = byId.get(id);
    return verb ? [verb] : [];
  });
  const primaryIds = new Set(primary.map((verb) => verb.id));
  const deleteVerb = byId.get('delete');
  const remaining = verbs.filter(
    (verb) => !primaryIds.has(verb.id) && !TRIAGE_BAR_DROPPED_IDS.has(verb.id) && verb.id !== 'delete',
  );
  return [
    ...primary,
    ...remaining,
    ...recordLinkVerbs(record),
    ...(deleteVerb ? [deleteVerb] : []),
  ];
}

/** The open record's own controls, when the strip is armed for it. */
interface OrderOpenRecordControls {
  /** The open order is in the bulk check-set. */
  checked: boolean;
  onToggleSelect?: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
}

interface OrderActionVerbsOptions {
  /** The lead order (the open record, or the first checked row). */
  record: ShippedOrder;
  /** The orders the verbs act on — the check-set, or `[record]`. */
  rows: readonly ShippedOrder[];
  /** The freshest copies of `rows` — state labels read these. */
  stateRows: readonly ShippedOrder[];
  viewKey: OrderViewKey;
  /** Present when armed for the open record (adds Select, drops Resolve / More information). */
  openRecord?: OrderOpenRecordControls;
  /** To Ship: the paperwork walk on the lead order (Label). */
  onOpenLabels?: (record: ShippedOrder) => void;
  /**
   * The triage list: Documents opens the lead order's label · slip · manuals
   * in the split pane. Present ⇒ a `documents` verb stands where Label does.
   */
  onOpenDocuments?: (record: ShippedOrder) => void;
  /** Mobile URL: Notes opens the phone's bottom sheet instead of the centered dialog. */
  onOpenNotesSheet?: () => void;
  /** A verb that ends the strip's job (Delete, Resolve, More information). */
  onFinished: () => void;
}

/** Every order verb for the strip the view offers (`VIEW_SPECS[viewKey].verbs`), over `rows`. */
function useOrderActionVerbs({
  record,
  rows,
  stateRows,
  viewKey,
  openRecord,
  onOpenLabels,
  onOpenDocuments,
  onOpenNotesSheet,
  onFinished,
}: OrderActionVerbsOptions): RecordActionVerb[] {
  const assign = useOrderAssignment();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stage = useDeskStageOptional();
  const snapshot = useRailActionSnapshot();
  const catalog =
    snapshot.scope === DASHBOARD_ORDERS_SELECTION_SCOPE
      ? (snapshot.actions as SelectionAction<ShippedOrder>[])
      : [];
  const actionRows = rows as ShippedOrder[];
  const orderId = Number(record.id);
  const actionIds = actionRows.map(orderIdOf).filter((id): id is number => id != null);
  const orderRef = String(record.order_id ?? '').trim() || String(record.id);
  const slip = usePrintPackingSlip(orderId);
  // Print packing slip only once a shipping label is linked and on file for this order.
  const documents = useOrderDocuments(actionRows.length === 1 ? orderId : 0);
  const hasShippingLabel = pickOrderDocument(documents.data?.documents ?? [], 'shipping_label', null) != null;

  const resolved = new Map(
    catalog.map((action) => [action.key, resolveSelectionAction(action, actionRows)] as const),
  );
  const scanOut = resolved.get('scan-out');

  const undoScanOut = () => {
    const jobs = actionRows
      .filter((row) => scanOutDirection(row as OutboundVerbRow) === 'undo')
      .map((row) => shipmentIdForScanOut(row as OutboundVerbRow))
      .filter((id): id is number => id != null)
      .map((shipmentId) =>
        fetch('/api/shipped/scan-out', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shipmentId }),
        }).then(async (res) => {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!res.ok) throw new Error(body?.error || `scan-out ${res.status}`);
        }),
      );
    if (jobs.length === 0) {
      toast.error('No scanned-out rows to undo in the selection');
      return;
    }
    void Promise.allSettled(jobs).then((results) => {
      const failed = results.filter((row) => row.status === 'rejected').length;
      const ok = results.length - failed;
      if (ok > 0) {
        bustScanOutCaches(queryClient);
        refreshDomain('orders.outbound');
        toast.success(ok === 1 ? 'Scan-out undone' : `Scan-out undone on ${ok} orders`);
      }
      if (failed > 0) toast.error(`${failed} of ${results.length} could not be updated`);
    });
  };

  // Live-derived (`stateRows`): the label and the toggle direction must both
  // answer the row's CURRENT urgency, not the click-time snapshot.
  const selectionIsUrgent = stateRows.length > 0 && stateRows.every(isUrgentRow);
  // A shipped order is already out the door: urgency is moot, a replacement is the verb.
  const selectionShipped = stateRows.length > 0 && stateRows.every(isOrderShipped);
  const markUrgent = () => {
    if (actionIds.length === 0) {
      toast.error('Select an order first');
      return;
    }
    const next = !selectionIsUrgent;
    // Undo flips back only the orders this press changed.
    const changedIds = actionRows
      .filter((row) => isUrgentRow(row) !== next)
      .map(orderIdOf)
      .filter((id): id is number => id != null);
    assign.mutate(
      { orderIds: actionIds, isUrgent: next },
      {
        onSuccess: () => {
          const message = next ? 'Marked urgent — pinned to top' : 'Urgent cleared';
          if (changedIds.length === 0) {
            toast.success(message);
            return;
          }
          toast.undo(message, {
            onUndo: () =>
              assign.mutate(
                { orderIds: changedIds, isUrgent: !next },
                { onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not undo urgent') },
              ),
          });
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update urgent'),
      },
    );
  };

  const selectionIsOutOfStock = stateRows.length > 0 && stateRows.every(isOutOfStockRow);
  const clearOutOfStock = useClearOutOfStock();
  const oosRows = actionRows.map((row) => row as MorphingOosRow);
  // Several orders that each carry one known product commit at once; one
  // order (or a kit) picks the short product in the display.
  const oosCommitsAtOnce = morphingOosStartView(oosRows) === 'commit-multi';
  const commitOosEach = () => {
    const staysPacked = morphingOosStaysPacked(oosRows);
    void Promise.all(
      oosRows.map(
        (row) =>
          new Promise<void>((resolve, reject) => {
            const id = morphingOosOrderId(row);
            if (id == null) {
              resolve();
              return;
            }
            assign.mutate(morphingOosAssignPayload([id], morphingListingIdentity(row)), {
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            });
          }),
      ),
    )
      .then(() =>
        showOosPendingToast({
          count: actionIds.length,
          staysPacked,
          onViewExceptions: () => router.push(OOS_ORDERS_HREF),
        }),
      )
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not mark out of stock'));
  };

  const openExceptionResolve = () => {
    onFinished();
    if (stage && stage.view === 'in-place') stage.setView('split');
    const params = new URLSearchParams(searchParams.toString());
    params.set('order', String(record.id));
    router.replace(`${EXCEPTIONS_PATH}?${params.toString()}`, { scroll: false });
  };

  /**
   * Buyer cancelled — every checked order (one order → that order) leaves the
   * list with the `buyer_cancelled` reason (`/api/orders/list-removal`, which
   * also sets the order's Buyer cancel status). Undo on the bottom-right toast
   * puts them back with their prior status (`DELETE`, same route).
   */
  const buyerCancel = () => {
    const ids = actionIds.length > 0 ? actionIds : [orderId];
    onFinished();
    markDismissed(ids);
    const settle = () => {
      bustFulfillmentCaches(queryClient);
      refreshDomain('orders.outbound');
    };
    void afterDismissPaint().then(async () => {
      hideRecords(ids);
      try {
        const res = await fetch('/api/orders/list-removal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderIds: ids, reason: 'buyer_cancelled' }),
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          restoreRecords(ids);
          toast.error(body?.error || 'Could not mark the order buyer cancelled');
          return;
        }
        settle();
        toast.undo(ids.length === 1 ? 'Buyer cancelled' : `${ids.length} orders buyer cancelled`, {
          onUndo: () => {
            void fetch('/api/orders/list-removal', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderIds: ids }),
            }).then((undo) => {
              if (!undo.ok) {
                toast.error('Could not undo the buyer cancel');
                return;
              }
              restoreRecords(ids);
              settle();
            });
          },
        });
      } catch {
        restoreRecords(ids);
        toast.error('Could not mark the order buyer cancelled');
      }
    });
  };

  const deleteOrder = () => {
    const ids = actionIds.length > 0 ? actionIds : [orderId];
    onFinished();
    void deleteOrdersWithUndo(ids, () => {
      bustFulfillmentCaches(queryClient);
      void queryClient.invalidateQueries({ queryKey: exceptionsQueryKey });
    });
  };

  const catalogVerb = (key: string, label: string, icon: ReactNode, hotkey?: string): RecordActionVerb[] => {
    const r = resolved.get(key);
    if (!r) return [];
    return [
      {
        id: key,
        label,
        icon,
        hotkey,
        disabled: r.disabled,
        disabledReason: r.reason,
        run: () => r.action.run(actionRows, r.direction ? { direction: r.direction } : undefined),
      },
    ];
  };

  const verbs: RecordActionVerb[] = [];

  if (viewOffersVerb(viewKey, 'paste')) {
    verbs.push({
      id: 'paste',
      label: 'Paste item #',
      hotkey: ORDER_VERB_HOTKEYS.paste,
      scope: 'single',
      // The centered dialog every order form shares: the field focused, Enter matches.
      dialog: (done) => <ExceptionPasteDialog record={record} onAmbiguous={openExceptionResolve} done={done} />,
    });
  }
  // The record's own Resolve section is the open record's pairing form.
  if (viewOffersVerb(viewKey, 'resolve') && !openRecord) {
    verbs.push({ id: 'resolve', label: 'Resolve', hotkey: ORDER_VERB_HOTKEYS.resolve, scope: 'single', run: openExceptionResolve });
  }
  if (viewOffersVerb(viewKey, 'out-of-stock')) {
    verbs.push(
      selectionIsOutOfStock
        ? // Clearing is the recovery, not a danger verb: one press, Undo on the toast.
          { id: 'out-of-stock', label: 'Mark not out of stock', icon: <AlertTriangle />, hotkey: ORDER_VERB_HOTKEYS['out-of-stock'], pressed: true, run: () => clearOutOfStock(actionRows) }
        : {
            id: 'out-of-stock',
            label: 'Report out of stock',
            icon: <AlertTriangle />,
            hotkey: ORDER_VERB_HOTKEYS['out-of-stock'],
            tone: 'danger',
            ...(oosCommitsAtOnce
              ? {
                  run: commitOosEach,
                  confirmDetail: `Each of the ${actionIds.length} orders is reported short of its one product and leaves the pick queue.`,
                }
              : // The short product is picked in a centered dialog that catches the eye — never in line, never a dropdown; Enter commits.
                { dialog: (done: () => void) => <OosDialog rows={oosRows} done={done} /> }),
          },
    );
  }
  if (viewOffersVerb(viewKey, 'pair-sku-location')) {
    const sku = String(record.sku ?? '').trim();
    const homeless = Boolean(sku) && !record.sku_home_location;
    verbs.push({
      id: 'pair-sku-location',
      // No home location yet: the filled amber CTA right under the ticket, so it cannot be missed.
      label: 'Pair SKU to location',
      icon: <MapPin />,
      hotkey: ORDER_VERB_HOTKEYS['pair-sku-location'],
      tone: homeless ? 'warning' : undefined,
      scope: 'single',
      disabled: !sku,
      disabledReason: 'This order has no SKU to pair',
      // The centered picker dialog — the same shape as Report out of stock; Enter pairs (operator 2026-10-08).
      dialog: (done) => <PairSkuLocationDialog record={record} done={done} />,
    });
  }
  if (viewOffersVerb(viewKey, 'urgent') && !selectionShipped) {
    verbs.push({
      id: 'urgent',
      label: selectionIsUrgent ? 'Clear urgent' : 'Mark urgent',
      icon: <Zap />,
      hotkey: ORDER_VERB_HOTKEYS.urgent,
      tone: 'yellow',
      pressed: selectionIsUrgent,
      run: markUrgent,
    });
  }
  verbs.push(
    onOpenDocuments
      ? {
          id: 'documents',
          label: 'Documents',
          icon: <FileText />,
          hotkey: ORDER_VERB_HOTKEYS.documents,
          scope: 'single',
          run: () => {
            onFinished();
            onOpenDocuments(record);
          },
        }
      : {
          id: 'label',
          label: 'Label',
          icon: <FileText />,
          hotkey: ORDER_VERB_HOTKEYS.documents,
          scope: 'single',
          dialog: (done) => <LabelDialog record={record} onOpenLabels={onOpenLabels} done={done} />,
        },
  );
  verbs.push({
    id: 'scan-out',
    label: scanOut?.label ?? 'Mark fulfilled',
    icon: <Truck />,
    hotkey: ORDER_VERB_HOTKEYS['scan-out'],
    disabled: scanOut?.disabled,
    disabledReason: scanOut?.reason,
    ...(scanOut?.direction === 'undo'
      ? { run: undoScanOut }
      : { dialog: (done: () => void) => <ScanOutDialog rows={actionRows} done={done} /> }),
  });
  verbs.push(
    onOpenNotesSheet
      ? { id: 'notes', label: 'Notes', hotkey: ORDER_VERB_HOTKEYS.notes, scope: 'single', run: onOpenNotesSheet }
      : {
          id: 'notes',
          label: 'Notes',
          hotkey: ORDER_VERB_HOTKEYS.notes,
          scope: 'single',
          dialog: () => (
            <div className="h-full min-h-0 overflow-y-auto" data-testid="order-notes-dialog">
              <OrderNotesTrail orderId={orderId} legacyNote={record.notes} autoFocus />
            </div>
          ),
        },
  );
  if (openRecord?.onToggleSelect) {
    const toggle = openRecord.onToggleSelect;
    verbs.push({
      id: 'select',
      label: openRecord.checked ? 'Selected' : 'Select',
      pressed: openRecord.checked,
      scope: 'single',
      run: () => toggle(record, { shiftKey: false }),
    });
  }
  verbs.push(...catalogVerb('copy', 'Copy', <Copy />, ORDER_VERB_HOTKEYS.copy));
  verbs.push(...catalogVerb('print', 'Print', <Printer />, ORDER_VERB_HOTKEYS.print));

  // ── ⋮ overflow ──
  if (viewOffersVerb(viewKey, 'create-rule')) {
    verbs.push({
      id: 'create-rule',
      label: 'Create rule',
      icon: <Bookmark />,
      hotkey: viewOffersVerb(viewKey, 'resolve') ? undefined : ORDER_VERB_HOTKEYS.resolve,
      run: () => {
        const rule = catalog.find((action) => action.key === 'listing-rule');
        if (rule) void rule.run(actionRows);
        else dispatchOpenListingStaffRules();
      },
    });
  }
  for (const [key, r] of resolved) {
    if (STRIP_OWNED_CATALOG_KEYS[key]) continue;
    verbs.push({
      id: key,
      label: r.label,
      icon: r.action.icon,
      // Keyed below: the selection bar's letter for the same verb, unless an order key holds it.
      disabled: r.disabled,
      disabledReason: r.reason,
      run: () => r.action.run(actionRows, r.direction ? { direction: r.direction } : undefined),
    });
  }
  if (hasShippingLabel) {
    verbs.push({
      id: 'print-slip',
      label: 'Print packing slip',
      icon: <Printer />,
      hotkey: ORDER_VERB_HOTKEYS['print-slip'],
      scope: 'single',
      disabled: slip.pending,
      run: slip.print,
    });
  }
  const hasTracking = Boolean(trackingOf(record));
  const refreshLabels = () => {
    bustFulfillmentCaches(queryClient);
    refreshDomain('orders.outbound');
  };
  verbs.push(
    {
      id: 'return-label',
      label: 'Return label',
      icon: <RotateCcw />,
      hotkey: ORDER_VERB_HOTKEYS['return-label'],
      // A filled lead CTA once shipped (the caller wants it back); a row before that.
      tone: selectionShipped ? 'success' : undefined,
      scope: 'single',
      display: (done) => (
        <ReturnLabelDialog orderId={orderId} orderRef={orderRef} onClose={done} onChange={refreshLabels} />
      ),
    },
    // The label this order needs next (operator 2026-10-08): no tracking linked
    // yet → Buy label leads; once it has shipped on one → Buy replacement label.
    hasTracking
      ? {
          id: 'replacement-label',
          label: 'Buy replacement label',
          icon: <Repeat />,
          hotkey: ORDER_VERB_HOTKEYS['label-buy'],
          // Solid blue once shipped — the record's lead CTA; tonal otherwise.
          tone: selectionShipped ? 'primary' : 'blue',
          scope: 'single',
          // The open record's lead verb once the order shipped: spelled out, key painted.
          standingKeycap: Boolean(openRecord) && selectionShipped,
          // The buy opens over the record (ship-to + parcel prefilled); the label lands on this order.
          display: (done) => (
            <OrderLabelBuyDialog
              purpose="replacement"
              order={{ orderRowId: orderId, orderNumber: orderRef, title: String(record.product_title ?? ''), tracking: trackingOf(record) }}
              open
              onOpenChange={(open) => {
                if (!open) done();
              }}
              onChange={refreshLabels}
            />
          ),
        }
      : {
          id: 'buy-label',
          label: 'Buy label',
          icon: <Tag />,
          hotkey: ORDER_VERB_HOTKEYS['label-buy'],
          tone: 'primary',
          scope: 'single',
          standingKeycap: Boolean(openRecord),
          // This morning's label form (oz, L × W × H, ship-to editor, rate shop) on the
          // outbound purpose — no replacement reason; the label lands on this order.
          display: (done) => (
            <OrderLabelBuyDialog
              purpose="outbound"
              order={{ orderRowId: orderId, orderNumber: orderRef, title: String(record.product_title ?? '') }}
              open
              onOpenChange={(open) => {
                if (!open) done();
              }}
              onChange={refreshLabels}
            />
          ),
        },
  );
  verbs.push({
    id: 'customer-ticket',
    label: 'Create customer ticket',
    icon: <Ticket />,
    hotkey: ORDER_VERB_HOTKEYS['customer-ticket'],
    scope: 'single',
    run: () => router.push(supportCreateTicketHref(orderId)),
  });
  verbs.push({ ...buildRecordTaskVerb({ entityType: 'order', entityId: orderId, label: `Order ${orderRef}` }), scope: 'single' });
  if (!openRecord) {
    verbs.push({
      id: 'more-info',
      label: 'More information',
      icon: <Tag />,
      hotkey: ORDER_VERB_HOTKEYS['more-info'],
      scope: 'single',
      run: () => {
        onFinished();
        dispatchOpenShippedDetails(record, 'queue', { force: true });
      },
    });
  }
  verbs.push({
    id: 'buyer-cancelled',
    label: actionIds.length > 1 ? `Buyer cancelled ${actionIds.length}` : 'Buyer cancelled',
    icon: <PackageX />,
    hotkey: ORDER_VERB_HOTKEYS['buyer-cancelled'],
    tone: 'danger',
    scope: 'both',
    // The centered dialog every order form shares; only its focused button (Enter) confirms, never Z again.
    dialog: (done) => (
      <BuyerCancelDialog
        rows={actionRows}
        onCancel={done}
        onConfirm={() => {
          done();
          buyerCancel();
        }}
      />
    ),
  });
  verbs.push({
    id: 'delete',
    label: actionIds.length > 1 ? `Delete ${actionIds.length}` : 'Delete',
    icon: <Trash2 />,
    hotkey: ORDER_VERB_HOTKEYS.delete,
    tone: 'danger',
    scope: 'both',
    confirmDetail:
      actionIds.length > 1
        ? `${actionIds.length} orders are deleted. Undo stays on the toast for a few seconds.`
        : `Order ${orderRef} is deleted. Undo stays on the toast for a few seconds.`,
    run: deleteOrder,
  });
  // Every verb carries a key. The strip's own verbs, the record's keys and the
  // list's keys claim their letters first; a catalog verb whose selection-bar
  // letter is taken (or claimed twice) goes keyless.
  const catalogKeys = orderCatalogHotkeys(
    [...resolved.keys()]
      .filter((key) => !STRIP_OWNED_CATALOG_KEYS[key])
      .map((id) => ({ id, hotkey: SELECTION_STATUS_BAR_META[id]?.hotkey })),
    verbs.flatMap((verb) => (verb.hotkey ? [verb.hotkey] : [])),
  );
  return verbs.map((verb) => (catalogKeys.has(verb.id) ? { ...verb, hotkey: catalogKeys.get(verb.id) } : verb));
}

/**
 * Mark fulfilled — the centered dialog form (operator 2026-10-08): when
 * (backdated at most `SCAN_OUT_DESK_MAX_BACKDATE_MS`) and who, then Save —
 * focused, so Enter saves the default (you, now). The staff list is in place
 * (search, Enter picks); picking hands focus back to Save.
 */
function ScanOutDialog({ rows, done }: { rows: readonly ShippedOrder[]; done: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState<number | null>(user?.staffId ?? null);
  const [at, setAt] = useState<Date | undefined>(() => new Date());
  const [saving, setSaving] = useState(false);
  const [shipped, setShipped] = useState<number | null>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const from = new Date(Date.now() - SCAN_OUT_DESK_MAX_BACKDATE_MS);
  const labelled = rows.filter((row) => trackingOf(row) != null).length;

  // Opens on Save when a staffer is known (Enter saves); else the staff search keeps focus.
  // Read once: a later pick focuses Save itself.
  const [opensOnSave] = useState(() => user?.staffId != null);
  useEffect(() => {
    if (opensOnSave) saveRef.current?.focus({ preventScroll: true });
  }, [opensOnSave]);

  const save = () => {
    if (saving) return;
    if (staffId == null) {
      toast.error('Select a staffer');
      return;
    }
    if (!at || Number.isNaN(at.getTime())) {
      toast.error('Pick a date and time');
      return;
    }
    const jobs = rows
      .map((row) => trackingOf(row))
      .filter((tracking): tracking is string => Boolean(tracking))
      .map((trackingNumber) =>
        fetch('/api/shipped/scan-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackingNumber,
            staffId,
            createdAt: at.toISOString(),
            source: SCAN_OUT_DESK_SOURCE,
          }),
        }).then(async (res) => {
          const body = (await res.json().catch(() => null)) as {
            matched?: boolean;
            blocked?: boolean;
            error?: string;
            message?: string;
          } | null;
          if (!res.ok) throw new Error(body?.error || `scan-out ${res.status}`);
          if (body?.matched === false) throw new Error('No shipment found for this label');
        }),
      );
    if (jobs.length === 0) {
      toast.error('No shipping label on the selected row(s)');
      return;
    }
    setSaving(true);
    void Promise.allSettled(jobs).then((results) => {
      const failed = results.filter((row) => row.status === 'rejected').length;
      const ok = results.length - failed;
      if (ok > 0) {
        bustScanOutCaches(queryClient);
        refreshDomain('orders.outbound');
      }
      if (failed > 0) {
        const first = results.find((row) => row.status === 'rejected');
        toast.error(
          first && first.status === 'rejected' && first.reason instanceof Error
            ? first.reason.message
            : `${failed} of ${results.length} could not be updated`,
        );
      }
      setSaving(false);
      if (ok > 0 && failed === 0) setShipped(ok);
    });
  };

  if (shipped != null) {
    return (
      <VerbDoneState
        title="Marked as shipped"
        detail={[shipped > 1 ? `${shipped} orders` : null, staffId != null ? getStaffName(staffId) : null, at?.toLocaleString()]
          .filter(Boolean)
          .join(' · ')}
        onDone={done}
        testId="order-scan-out-done"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3" data-testid="order-scan-out-dialog">
      <p className="text-role-caption text-text-soft">
        {labelled === rows.length
          ? rows.length === 1
            ? 'The order is marked shipped on its label.'
            : `${rows.length} orders are marked shipped on their labels.`
          : `${labelled} of ${rows.length} orders carry a shipping label; only those are marked shipped.`}
      </p>
      <div className="flex flex-col gap-1.5">
        <span className={cn(RECORD_LABEL_CLASS, 'text-text-muted')}>When</span>
        <DateTimePickerField value={at} onChange={setAt} placeholder="Date and time" fromDate={from} toDate={new Date()} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <span className={cn(RECORD_LABEL_CLASS, 'text-text-muted')}>
          Who scanned out{staffId != null ? ` · ${getStaffName(staffId)}` : ''}
        </span>
        <StaffPickList
          role="all"
          selectedStaffId={staffId}
          onPick={(next) => {
            setStaffId(next);
            saveRef.current?.focus({ preventScroll: true });
          }}
          ariaLabel="Staff who scanned out"
          testId="order-scan-out-staff"
          className="min-h-0 flex-1"
        />
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
        <Button
          ref={saveRef}
          type="button"
          variant="success"
          size="md"
          icon={<Truck />}
          className="w-full"
          disabled={saving || staffId == null}
          data-testid="order-scan-out-save"
          onClick={save}
        >
          {saving ? 'Saving…' : 'Mark as shipped'}
        </Button>
        <p className="text-center text-role-micro text-text-soft">Enter saves</p>
      </div>
    </div>
  );
}

/**
 * Report out of stock — the centered dialog's product combobox: search open
 * and focused, the order's own products (a kit's parts from its catalog
 * composition) first, Enter marks the highlighted product short.
 */
function OosDialog({ rows, done }: { rows: readonly MorphingOosRow[]; done: () => void }) {
  const assign = useOrderAssignment();
  const router = useRouter();
  const [kitByCatalog, setKitByCatalog] = useState<Map<number, KitComposition>>(new Map());

  const catalogKey = rows.map((row) => Number(row.sku_catalog_id) || 0).join(',');
  useEffect(() => {
    const ids = [...new Set(catalogKey.split(',').map(Number).filter((id) => id > 0))];
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.all(
      ids.map(async (catalogId) => {
        const res = await fetch(`/api/sku-catalog/${catalogId}/composition`);
        const body = (await res.json().catch(() => null)) as { composition?: KitComposition } | null;
        return [catalogId, body?.composition ?? null] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setKitByCatalog(new Map(pairs.filter((pair): pair is readonly [number, KitComposition] => pair[1] != null)));
    });
    return () => {
      cancelled = true;
    };
  }, [catalogKey]);

  // The done face: what was marked, until the operator taps Done (or Enter).
  const [marked, setMarked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const commit = (row: MorphingOosRow, identity: OrderShortageIdentity, label: string) => {
    const id = morphingOosOrderId(row);
    if (id == null) {
      toast.error('Select an order first');
      return;
    }
    if (saving) return;
    setSaving(true);
    assign.mutate(morphingOosAssignPayload([id], identity), {
      onSuccess: () => {
        showOosPendingToast({
          count: 1,
          sku: identity.sku,
          qtyShort: identity.qtyShort,
          staysPacked: morphingOosStaysPacked([row]),
          onViewExceptions: () => router.push(OOS_ORDERS_HREF),
        });
        setMarked(label);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not mark out of stock'),
      onSettled: () => setSaving(false),
    });
  };

  if (marked) {
    return <VerbDoneState title="Marked out of stock" detail={marked} onDone={done} testId="order-oos-done" />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-testid="order-oos-dialog">
      <OosProductCombobox
        surface="open"
        lines={[...rows]}
        compositionByCatalogId={kitByCatalog}
        onPick={(orderRowId, identity) => {
          const target = rows.find((row) => morphingOosOrderId(row) === orderRowId) ?? rows[0];
          if (target) commit(target, identity, identity.title || identity.sku || 'This product');
        }}
      />
    </div>
  );
}

/** What each upload links, for its target and its done face. */
const LABEL_UPLOADS: Record<'packing_slip' | 'shipping_label', { label: string; done: string; icon: ReactNode }> = {
  packing_slip: { label: 'Upload packing slip', done: 'Packing slip linked', icon: <FileText /> },
  shipping_label: { label: 'Upload shipping label', done: 'Shipping label linked', icon: <Truck /> },
};

/**
 * Label — the centered dialog (operator 2026-10-08): link a packing slip or a
 * shipping label the packer scan prints, two large targets (the first
 * focused; Enter opens the file picker), or walk the labels. A landed upload
 * shows the done face.
 */
function LabelDialog({
  record,
  onOpenLabels,
  done,
}: {
  record: ShippedOrder;
  onOpenLabels?: (record: ShippedOrder) => void;
  done: () => void;
}) {
  const queryClient = useQueryClient();
  const inputRefs = useRef(new Map<keyof typeof LABEL_UPLOADS, HTMLInputElement>());
  const [uploading, setUploading] = useState<keyof typeof LABEL_UPLOADS | null>(null);
  const [linked, setLinked] = useState<keyof typeof LABEL_UPLOADS | null>(null);
  const id = Number(record.id);
  const orderRef = String(record.order_id ?? '').trim() || String(id);

  const upload = (documentType: keyof typeof LABEL_UPLOADS, file: File | undefined) => {
    if (!file || uploading) return;
    const form = new FormData();
    form.set('file', file);
    form.set('documentType', documentType);
    form.set('orderRef', String(record.order_id || id));
    setUploading(documentType);
    void fetch(`/api/orders/${id}/documents/upload`, { method: 'POST', body: form })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          toast.error(body?.error || 'Could not upload the document');
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ['order-documents', id] });
        refreshDomain('orders.outbound');
        setLinked(documentType);
      })
      .catch(() => toast.error('Could not upload the document'))
      .finally(() => setUploading(null));
  };

  if (linked) {
    return (
      <VerbDoneState
        title={LABEL_UPLOADS[linked].done}
        detail={`Order ${orderRef} · the packer scan prints it`}
        onDone={done}
        testId="order-label-done"
      />
    );
  }

  const kinds = Object.keys(LABEL_UPLOADS) as (keyof typeof LABEL_UPLOADS)[];
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3" data-testid="order-label-dialog">
      <p className="text-role-caption text-text-soft">
        Link a document to order <span className="font-mono text-text-default">{orderRef}</span>; the packer scan prints it.
      </p>
      {kinds.map((kind) => (
        // ds-raw-button: hidden file input behind the upload target — no file primitive exists.
        <input
          key={kind}
          ref={(node) => {
            if (node) inputRefs.current.set(kind, node);
            else inputRefs.current.delete(kind);
          }}
          type="file"
          accept="application/pdf,image/*"
          tabIndex={-1}
          className="sr-only"
          data-testid={`order-label-${kind}-input`}
          onChange={(event) => {
            upload(kind, event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      ))}
      <div className="flex flex-1 flex-col gap-2">
        {kinds.map((kind, index) => (
          <Button
            key={kind}
            type="button"
            variant="secondary"
            size="xl"
            icon={LABEL_UPLOADS[kind].icon}
            autoFocus={index === 0}
            className="min-h-20 w-full flex-1 justify-start"
            disabled={uploading != null}
            data-testid={`order-label-${kind}`}
            onClick={() => inputRefs.current.get(kind)?.click()}
          >
            {uploading === kind ? 'Uploading…' : LABEL_UPLOADS[kind].label}
          </Button>
        ))}
      </div>
      {onOpenLabels ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          data-testid="order-label-walk"
          onClick={() => {
            done();
            onOpenLabels(record);
          }}
        >
          Labels walk
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Paste item # — the centered dialog (operator 2026-10-08): the item number
 * or listing URL field is focused; Enter matches. A unique match backfills
 * the order and shows the done face; several matches hand off to Resolve.
 */
function ExceptionPasteDialog({
  record,
  onAmbiguous,
  done,
}: {
  record: ShippedOrder;
  onAmbiguous: () => void;
  done: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [pasting, setPasting] = useState(false);
  const [matched, setMatched] = useState<{ title: string; detail: string } | null>(null);
  const orderRef = String(record.order_id ?? '').trim() || String(record.id);

  const commit = (value: string) => {
    const next = value.trim();
    if (!next || pasting) return;
    setPasting(true);
    void commitExceptionsItemPaste(next, [
      { id: Number(record.id), itemNumber: record.item_number ?? null, accountSource: record.account_source ?? null },
    ]).then(async (result) => {
      setPasting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.outcome === 'ambiguous') {
        toast.error('Several catalog matches — pick one in Resolve.');
        done();
        onAmbiguous();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: exceptionsQueryKey });
      setMatched(
        result.outcome === 'saved-item'
          ? { title: 'Item number saved', detail: 'Open Resolve if it still needs a catalog SKU.' }
          : {
              title: `Matched ${result.sku}`,
              detail: result.ordersUpdated > 1 ? `Backfilled ${result.ordersUpdated} orders.` : `Backfilled order ${orderRef}.`,
            },
      );
    });
  };

  if (matched) {
    return <VerbDoneState title={matched.title} detail={matched.detail} onDone={done} testId="exceptions-paste-item-done" />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3" data-testid="exceptions-paste-item-field">
      <p className="text-role-caption text-text-soft">
        Order <span className="font-mono text-text-default">{orderRef}</span> — paste its item number or listing URL; a
        unique catalog match backfills the order.
      </p>
      <SearchField
        value={draft}
        onChange={setDraft}
        onSearch={commit}
        placeholder="Item number or listing URL…"
        autoFocus
        hideLeadingIcon
        tone="neutral"
        isSearching={pasting}
        debounceMs={0}
      />
      <p className="text-role-micro text-text-soft">Enter matches</p>
    </div>
  );
}

/**
 * The strip armed for the OPEN record — To Ship, Pending, Exceptions (the
 * ledger's strip row) and Shipped (`DataTable` `actionStrip`), both views.
 * Keyed by the order so walking J/K resets an open display / armed Delete.
 */
export function OrderRecordActionStrip({
  record,
  viewKey,
  checked = false,
  onToggleSelect,
  onOpenLabels,
  face,
}: {
  record: ShippedOrder;
  viewKey: OrderViewKey;
  onOpenLabels?: (record: ShippedOrder) => void;
  /** Default: `header` for an allocate record, `strip` otherwise. `panel` = the record's Actions group in its side column. */
  face?: 'strip' | 'header' | 'panel';
} & Partial<OrderOpenRecordControls>) {
  const allVerbs = useOrderActionVerbs({
    record,
    rows: [record],
    stateRows: [record],
    viewKey,
    openRecord: { checked, onToggleSelect },
    onOpenLabels,
    onFinished: () => undefined,
  });
  const allocateDetail = VIEW_SPECS[viewKey].recordPresentation === 'allocate';
  // Ledger desks keep one ordered action list; RecordActionStrip chooses the
  // three visible non-destructive actions and owns the overflow.
  const ranked = (() => {
    if (viewKey === 'shipping.shipped') return allVerbs;
    if (!allocateDetail) {
      return [
        ...allVerbs.filter((verb) => ORDER_BULK_VERB_IDS.has(verb.id)),
        ...recordMoreVerbs(record, allVerbs),
      ];
    }

    // Escalation actions lead in importance order. Everything else follows.
    const byId = new Map(allVerbs.map((verb) => [verb.id, verb]));
    const lead = byId.has('buy-label') ? ALLOCATE_LEAD_UNSHIPPED : ALLOCATE_LEAD_SHIPPED;
    const primary = lead.flatMap(({ id, face }) => {
      const verb = byId.get(id);
      return verb ? [{ ...verb, ...face }] : [];
    });
    const scanOut = byId.get('scan-out');
    const deleteVerb = byId.get('delete');
    const skip = new Set([
      'select',
      'label',
      'notes',
      'paperwork',
      'copy',
      'print',
      'create-rule',
      'sku-stock',
      'rules',
      'scan-out',
      'delete',
      ...RECORD_INLINE_VERB_IDS,
    ]);
    const seen = new Set(primary.map((verb) => verb.id));
    const overflow: RecordActionVerb[] = [];
    for (const verb of [...allVerbs, ...recordMoreVerbs(record, allVerbs)]) {
      // A verb opens something or runs: `run`, an in-place `display` or the centered `dialog`.
      if (skip.has(verb.id) || seen.has(verb.id) || (!verb.run && !verb.display && !verb.dialog)) continue;
      seen.add(verb.id);
      overflow.push(verb);
    }
    overflow.push({ ...paperworkVerb(record, 'Documents'), hotkey: ORDER_VERB_HOTKEYS.documents });
    if (scanOut) overflow.push(scanOut);
    if (deleteVerb) overflow.push(deleteVerb);
    return [...primary, ...overflow];
  })();
  // A shipped order leads with the replacement buy — the reason the caller rang.
  const replacement = isOrderShipped(record) ? ranked.find((verb) => verb.id === 'replacement-label') : undefined;
  const verbs = replacement ? [replacement, ...ranked.filter((verb) => verb !== replacement)] : ranked;
  const orderRef = String(record.order_id ?? '').trim() || String(record.id);
  return (
    <RecordActionStrip
      verbs={verbs}
      label={`Order ${orderRef} actions`}
      testId="order-record-actions"
      face={face ?? (allocateDetail ? 'header' : 'strip')}
    />
  );
}

/** Paperwork — label · slip · manuals for the lead order, in one dialog. */
function paperworkVerb(record: ShippedOrder, label = 'Paperwork'): RecordActionVerb {
  return { id: 'paperwork', label, icon: <FileText />, scope: 'single', run: () => dispatchOpenOrderPaperwork(Number(record.id)) };
}

/** The record's links out — the lead SKU's stock, the listing rules. */
function recordLinkVerbs(record: ShippedOrder): RecordActionVerb[] {
  const sku = String(record.sku ?? '').trim();
  return [
    ...(sku
      ? [{ id: 'sku-stock', label: 'SKU stock', icon: <Tag />, scope: 'single' as const, run: () => void window.open(`/inventory?sku=${encodeURIComponent(sku)}`, '_blank', 'noopener,noreferrer') }]
      : []),
    { id: 'rules', label: 'Rules', icon: <Bookmark />, run: () => dispatchOpenListingStaffRules() },
  ];
}

/** The record's non-triage actions, deduped against what it answers inline — Paperwork first. */
function recordMoreVerbs(record: ShippedOrder, verbs: readonly RecordActionVerb[]): RecordActionVerb[] {
  return [
    paperworkVerb(record),
    ...verbs.filter(
      (verb) =>
        (verb.run || verb.display || verb.dialog) &&
        !ORDER_BULK_VERB_IDS.has(verb.id) &&
        !RECORD_INLINE_VERB_IDS.has(verb.id),
    ),
    ...recordLinkVerbs(record),
  ];
}

/** The open record's "More actions" (below its details) — the same list as the strip's ⋮. */
export function useOrderRecordMoreVerbs(record: ShippedOrder, viewKey: OrderViewKey): RecordActionVerb[] {
  const verbs = useOrderActionVerbs({
    record,
    rows: [record],
    stateRows: [record],
    viewKey,
    openRecord: { checked: false },
    onFinished: () => undefined,
  });
  return recordMoreVerbs(record, verbs);
}

/**
 * The ENGINE-facing face of the check-set strip — what
 * `TableSurfaceBinding.rowPlane` registers for the orders entity (`row` →
 * `record`, one rename adapter beside the panel it adapts).
 */
export function OrdersRowPlane({ row, ...plane }: TableRowPlaneProps<ShippedOrder>) {
  return <MorphingRowActionMenu record={row} {...plane} />;
}

/** The check-set strip (CYC-82): the order verbs over the checked rows. */
function MorphingRowActionMenu({
  record,
  open,
  onClose,
  anchorRef,
  inline = false,
  liveRecords,
  viewKey = 'shipping.to-ship',
  face = 'strip',
  verbSet = 'check-set',
  onOpenDocuments,
}: {
  record: ShippedOrder;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** Mounted in the table's action row by its host (no portal). */
  inline?: boolean;
  /**
   * The grid's CURRENT rows, when the host has them. The rail selection store
   * carries click-time snapshots, so state labels (Mark / Clear urgent) read
   * the live row by id and fall back to the snapshot.
   */
  liveRecords?: readonly ShippedOrder[];
  /** The view the strip acts for; the engine's gutter plane (`OrdersRowPlane`) is To ship's. */
  viewKey?: OrderViewKey;
  /**
   * `header`: painted inside the table header that became the bulk bar —
   * bare strip, and Escape clears the check-set before anything else closes.
   */
  face?: 'strip' | 'header';
  /** `triage`: the triage list's selection bar (Law 5) — {@link triageBarVerbs}. */
  verbSet?: 'check-set' | 'triage';
  /** The triage list's Documents verb — the lead order's documents in the split pane. */
  onOpenDocuments?: (record: ShippedOrder) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const hadSelection = useRef(false);
  const pathname = usePathname();
  const onMobileUrl = isMorphingMobileUrl(pathname);
  const { rows: selectedRows } = useRailActionSnapshot();
  const actionRows = (selectedRows.length > 0 ? selectedRows : [record]) as ShippedOrder[];
  const liveById = new Map((liveRecords ?? []).map((row) => [Number(row.id), row]));
  const stateRows = actionRows.map((row) => liveById.get(Number(orderIdOf(row))) ?? row);
  const close = () => {
    setNotesOpen(false);
    onClose();
  };

  const allVerbs = useOrderActionVerbs({
    record,
    rows: actionRows,
    stateRows,
    viewKey,
    onOpenDocuments,
    onOpenNotesSheet: onMobileUrl ? () => setNotesOpen(true) : undefined,
    onFinished: close,
  });
  // Triage bar: its one list. Phones keep the whole strip (no record rail
  // there); the desk's check-set strip shows bulk buttons.
  const listed =
    verbSet === 'triage' ? triageBarVerbs(record, allVerbs) : onMobileUrl ? allVerbs : bulkStripVerbs(allVerbs);
  const verbs = scopeRecordVerbs(listed, actionRows.length, ORDER_NOUN);

  useEffect(() => {
    if (!open) return;
    rememberRowPlaneOpen(true);
    setNotesOpen(false);
    return () => rememberRowPlaneOpen(false);
  }, [open]);

  // The row plane portals into the table's action row (under the search
  // toolbar); the inline host is already in it.
  useLayoutEffect(() => {
    if (inline) return;
    if (!open) {
      setOverlayHost(null);
      return;
    }
    const table =
      anchorRef.current?.closest(`[${DATA_TABLE_OVERLAY_HOST_ATTR}]`)
      ?? document.querySelector(`[${DATA_TABLE_OVERLAY_HOST_ATTR}]`);
    const slot = (table ?? document).querySelector(`[${DATA_TABLE_ACTION_ROW_ATTR}]`);
    setOverlayHost(slot instanceof HTMLElement ? slot : null);
  }, [open, anchorRef, inline]);

  // Unchecking the last row closes the strip.
  useEffect(() => {
    if (!open) {
      hadSelection.current = false;
      return;
    }
    if (selectedRows.length > 0) {
      hadSelection.current = true;
      return;
    }
    if (hadSelection.current) close();
  }, [open, selectedRows.length]);

  if (!open || (!inline && !overlayHost)) return null;
  const strip = (
    <>
      <RecordActionStrip
        key={Number(record.id)}
        verbs={verbs}
        label="Row actions"
        testId="morphing-row-action-menu"
        face={face}
        onDismiss={face === 'header' || selectedRows.length === 0 ? close : undefined}
      />
      {onMobileUrl ? (
        <Sheet open={notesOpen} onOpenChange={(next) => { if (!next) setNotesOpen(false); }}>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-2 pr-12">
              <SheetTitle className="text-role-caption">Notes</SheetTitle>
            </SheetHeader>
            <SheetBody className="pt-2">
              <OrderNotesTrail orderId={Number(record.id)} legacyNote={record.notes} autoFocus variant="compact" />
            </SheetBody>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
  return inline ? strip : createPortal(strip, overlayHost as HTMLElement);
}

/**
 * The DataTable host of the order strip — ONE verbs source, two placements:
 * - `header` (`DataTable` `bulkBar`, the floor ledger's check-set bar, and the
 *   triage list's selection bar with `verbSet="triage"`): the check-set strip
 *   while rows are checked, else nothing. Escape clears the check-set.
 * - `action-row` (`DataTable` `actionStrip`): the open record's strip when the
 *   list sits in a record plane with a record open and nothing is checked —
 *   a live check-set owns the verbs in the header instead.
 */
export function OrdersMorphingHost({
  records,
  selectedIds,
  viewKey,
  placement,
  openRecordStrip,
  verbSet,
  onOpenDocuments,
}: {
  records: ShippedOrder[];
  selectedIds: ReadonlySet<number>;
  viewKey: OrderViewKey;
  placement: 'header' | 'action-row';
  /** The open record's strip, from the desk that owns the open record (`action-row` only). */
  openRecordStrip?: ReactNode;
  /** `header` only — which verb list the check-set strip paints. */
  verbSet?: 'check-set' | 'triage';
  onOpenDocuments?: (record: ShippedOrder) => void;
}) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const { rows, scope } = useRailActionSnapshot();
  const plane = useDeskRecordPlaneOptional();
  const record =
    (rows[0] as ShippedOrder | undefined)
    ?? records.find((row) => selectedIds.has(Number(row.id)));
  if (placement === 'action-row') {
    return !record && plane?.open ? <>{openRecordStrip}</> : null;
  }
  if (!record) return null;
  return (
    <MorphingRowActionMenu
      record={record}
      open
      inline
      face="header"
      viewKey={viewKey}
      verbSet={verbSet}
      onOpenDocuments={onOpenDocuments}
      liveRecords={records}
      onClose={() => {
        if (scope) emitToggleAll(scope, 'none');
      }}
      anchorRef={anchorRef}
    />
  );
}

/**
 * Mobile stack gutter — its own checkbox, so the manifold comes with it.
 * The desktop grid paints its leading track via the shared compound engine
 * and mounts {@link OrdersRowPlane} from the binding instead.
 */
export function MorphingSelectGutter({
  record,
  isChecked,
  chrome = 'hover',
  onToggleSelect,
  enabled,
}: {
  record: ShippedOrder;
  isChecked: boolean;
  chrome?: GridSelectGutterChrome;
  onToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  enabled: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  if (!enabled) {
    return (
      <GridRowCheckbox
        checked={isChecked}
        onToggle={(event) => onToggleSelect(record, event)}
        label={isChecked ? 'Deselect row' : 'Select row'}
        chrome={chrome}
      />
    );
  }

  return (
    <div ref={anchorRef} className="relative h-full w-full">
      <GridRowCheckbox
        checked={isChecked}
        onToggle={(event) => {
          applyMorphingGutterClick({
            isChecked,
            shiftKey: event.shiftKey,
            onToggle: (next) => onToggleSelect(record, next),
            onOpenMenu: () => setOpen(true),
            onCloseMenu: () => setOpen(false),
          });
        }}
        label={isChecked ? 'Deselect row' : 'Select row and open actions'}
        chrome={chrome}
      />
      <MorphingRowActionMenu
        record={record}
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
      />
    </div>
  );
}
