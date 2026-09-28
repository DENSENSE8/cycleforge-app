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
  Printer,
  Repeat,
  RotateCcw,
  Tag,
  Trash2,
  Truck,
  Zap,
} from '@/components/Icons';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { bustFulfillmentCaches, bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { deleteOrdersWithUndo } from '@/lib/orders/deferred-order-delete';
import {
  applyMorphingGutterClick,
  isMorphingMobileUrl,
  MORPHING_MORE_INFO_HOTKEY,
  MORPHING_NOTES_HOTKEY,
} from '@/lib/outbound/morphing-row-action';
import { rememberRowPlaneOpen } from '@/components/tables/compound/compound-row-plane';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { dispatchOpenShippedDetails, dispatchOpenListingStaffRules, dispatchOpenOrderPaperwork } from '@/utils/events';
import { OrderNotesTrail } from '@/components/shipped/details-panel/OrderNotesTrail';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  GridRowCheckbox,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { TableRowPlaneProps } from '@/components/tables/table-surface-binding';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { SHIPPING_EXCEPTIONS_PATH, SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';
import { commitExceptionsItemPaste } from '@/lib/orders/exceptions-cta';
import { SearchField } from '@/design-system/primitives/SearchField';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { useAuth } from '@/contexts/AuthContext';
import { getStaffName } from '@/utils/staff';
import { StaffAvatar } from '@/components/identity';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import { refreshDomain } from '@/lib/refresh/bus';
import {
  SCAN_OUT_DESK_MAX_BACKDATE_MS,
  SCAN_OUT_DESK_SOURCE,
} from '@/lib/outbound/scan-out-desk-stamp';
import { scanOutDirection, shipmentIdForScanOut, type OutboundVerbRow } from '@/lib/selection/order-verb-state';
import {
  SLOT_TABLE_ACTION_ROW_ATTR,
  SLOT_TABLE_OVERLAY_HOST_ATTR,
} from '@/components/tables/slot-table-overlay-host';
import { useRailActionSnapshot } from '@/components/right-rail/RailSelectionActions';
import { resolveSelectionAction, type SelectionAction } from '@/lib/selection/selection-actions';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { showOosPendingToast } from '@/lib/outbound/oos-pending-toast';
import {
  morphingListingIdentity,
  morphingOosAssignPayload,
  morphingOosOrderId,
  morphingOosStartView,
  morphingOosStaysPacked,
  type MorphingOosRow,
} from '@/lib/outbound/morphing-oos';
import { shortageIdentityFromRow, type OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';
import { PRINT_SLIP_HOTKEY, usePrintPackingSlip } from '@/components/outbound/orders/record-keys/print-slip';
import type { KitComposition } from '@/lib/orders/order-kit-composition';
import { viewOffersVerb, type OrderViewKey } from '@/lib/views/view-specs';
import { OosProductCombobox } from '@/components/outbound/orders/oos/OosProductCombobox';
import { buildRecordTaskVerbs } from '@/components/tasks/RecordTaskActions';

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

/** Desktop check-set strip: bulk verbs as buttons, the check-set's other verbs in ⋮. */
function bulkStripVerbs(verbs: readonly RecordActionVerb[]): RecordActionVerb[] {
  return verbs
    .filter((verb) => !RAIL_REPLACED_VERB_IDS.has(verb.id))
    .map((verb) =>
      ORDER_BULK_VERB_IDS.has(verb.id) || verb.placement === 'overflow' || verb.placement === 'isolated'
        ? verb
        : { ...verb, placement: 'overflow' as const },
    );
}

/**
 * The triage list's selection bar (Law 5, owner 2026-09-27): ONE list in ONE
 * order at 1 or N checked — the triage verbs as buttons, the check-set catalog
 * and the record links behind ⋮, Delete far right. A verb that cannot take
 * the check-set stays in place, disabled with its reason ({@link scopeRecordVerbs}).
 * Documents (label · slip · manuals, in the split pane) replaces Label and
 * Paperwork; Notes are written on the card's own line 1; More information is
 * the quick look (Space) and the open record — none of those has a seat here.
 */
const TRIAGE_BAR_PRIMARY_IDS: readonly string[] = ['paste', 'resolve', 'out-of-stock', 'urgent', 'scan-out', 'documents'];
const TRIAGE_BAR_DROPPED_IDS: ReadonlySet<string> = new Set(['more-info', 'select', 'notes', 'label']);

function triageBarVerbs(record: ShippedOrder, verbs: readonly RecordActionVerb[]): RecordActionVerb[] {
  const byId = new Map(verbs.map((verb) => [verb.id, verb]));
  const primary = TRIAGE_BAR_PRIMARY_IDS.flatMap((id) => {
    const verb = byId.get(id);
    return verb ? [{ ...verb, placement: 'primary' as const }] : [];
  });
  const overflow = [
    ...verbs.filter(
      (verb) =>
        !TRIAGE_BAR_PRIMARY_IDS.includes(verb.id) &&
        !TRIAGE_BAR_DROPPED_IDS.has(verb.id) &&
        verb.placement !== 'isolated',
    ),
    ...recordLinkVerbs(record),
  ].map((verb) => ({ ...verb, placement: 'overflow' as const }));
  return [...primary, ...overflow, ...verbs.filter((verb) => verb.placement === 'isolated')];
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
  /** Mobile URL: Notes opens the sheet instead of morphing the strip. */
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
  const clearOutOfStock = () => {
    // Undo re-reports each order with the shortage it carried before the clear.
    const cleared = actionRows
      .filter(isOutOfStockRow)
      .map((row) => ({
        id: orderIdOf(row),
        identity: shortageIdentityFromRow(row) ?? morphingListingIdentity(row as MorphingOosRow),
      }))
      .filter((entry): entry is { id: number; identity: OrderShortageIdentity } => entry.id != null);
    assign.mutate(
      { orderIds: actionIds, isOutOfStock: false },
      {
        onSuccess: () =>
          toast.undo(actionIds.length === 1 ? 'Out of stock cleared' : 'Cleared out of stock on selected orders', {
            onUndo: () => {
              for (const entry of cleared) {
                assign.mutate(morphingOosAssignPayload([entry.id], entry.identity), {
                  onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not undo the clear'),
                });
              }
            },
          }),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Could not clear out of stock'),
      },
    );
  };
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
          onViewPending: () => router.push(SHIPPING_SHORTAGE_PATH),
        }),
      )
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not mark out of stock'));
  };

  const openExceptionResolve = () => {
    onFinished();
    if (stage && stage.view === 'in-place') stage.setView('split');
    const params = new URLSearchParams(searchParams.toString());
    params.set('order', String(record.id));
    router.replace(`${SHIPPING_EXCEPTIONS_PATH}?${params.toString()}`, { scroll: false });
  };

  /**
   * Delete every checked order (one order → that order), with Undo: they
   * swipe left off the list now; the ONE delete route (permission + step-up
   * there) hears about it when the Undo window ends.
   */
  const deleteOrder = () => {
    const ids = actionIds.length > 0 ? actionIds : [orderId];
    onFinished();
    void deleteOrdersWithUndo(ids, () => {
      bustFulfillmentCaches(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['order-exceptions'] });
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
      hotkey: 'v',
      scope: 'single',
      display: (done) => (
        <ExceptionPasteDisplay record={record} onAmbiguous={openExceptionResolve} done={done} />
      ),
    });
  }
  // The record's own Resolve section is the open record's pairing form.
  if (viewOffersVerb(viewKey, 'resolve') && !openRecord) {
    verbs.push({ id: 'resolve', label: 'Resolve', hotkey: 'r', scope: 'single', run: openExceptionResolve });
  }
  if (viewOffersVerb(viewKey, 'out-of-stock')) {
    verbs.push({
      id: 'out-of-stock',
      label: selectionIsOutOfStock ? 'Clear out of stock' : 'Report out of stock',
      icon: <AlertTriangle />,
      hotkey: 'o',
      tone: 'danger',
      pressed: selectionIsOutOfStock,
      ...(selectionIsOutOfStock
        ? { run: clearOutOfStock }
        : oosCommitsAtOnce
          ? { run: commitOosEach }
          : { display: (done: () => void) => <OosDisplay rows={oosRows} done={done} /> }),
    });
  }
  if (viewOffersVerb(viewKey, 'urgent')) {
    verbs.push({
      id: 'urgent',
      label: selectionIsUrgent ? 'Clear urgent' : 'Mark urgent',
      icon: <Zap />,
      hotkey: 'u',
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
          hotkey: 'l',
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
          hotkey: 'l',
          scope: 'single',
          display: (done) => <LabelDisplay record={record} onOpenLabels={onOpenLabels} done={done} />,
        },
  );
  verbs.push({
    id: 'scan-out',
    label: scanOut?.label ?? 'Mark scanned out',
    icon: <Truck />,
    // S, not X: X checks the record under the cursor on every list (Law 5).
    hotkey: 's',
    disabled: scanOut?.disabled,
    disabledReason: scanOut?.reason,
    ...(scanOut?.direction === 'undo'
      ? { run: undoScanOut }
      : { display: (done: () => void) => <ScanOutDisplay rows={actionRows} done={done} /> }),
  });
  verbs.push(
    onOpenNotesSheet
      ? { id: 'notes', label: 'Notes', hotkey: MORPHING_NOTES_HOTKEY, scope: 'single', run: onOpenNotesSheet }
      : {
          id: 'notes',
          label: 'Notes',
          hotkey: MORPHING_NOTES_HOTKEY,
          scope: 'single',
          display: () => (
            <OrderNotesTrail
              orderId={orderId}
              legacyNote={record.notes}
              autoFocus
              variant="strip"
              className="min-w-0 flex-1"
            />
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
  verbs.push(...catalogVerb('copy', 'Copy', <Copy />, 'c'));
  verbs.push(...catalogVerb('print', 'Print', <Printer />, 'p'));

  // ── ⋮ overflow ──
  if (viewOffersVerb(viewKey, 'create-rule')) {
    verbs.push({
      id: 'create-rule',
      label: 'Create rule',
      icon: <Bookmark />,
      hotkey: viewOffersVerb(viewKey, 'resolve') ? undefined : 'r',
      placement: 'overflow',
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
      placement: 'overflow',
      disabled: r.disabled,
      disabledReason: r.reason,
      run: () => r.action.run(actionRows, r.direction ? { direction: r.direction } : undefined),
    });
  }
  // Return / replacement labels open the label desk, looked up on this order.
  const labelDeskHref = `/search?entry=label&q=${encodeURIComponent(orderRef)}&purpose=`;
  verbs.push(
    {
      id: 'print-slip',
      label: 'Print packing slip',
      icon: <Printer />,
      hotkey: PRINT_SLIP_HOTKEY,
      placement: 'overflow',
      scope: 'single',
      disabled: slip.pending,
      run: slip.print,
    },
    {
      id: 'return-label',
      label: 'Return label',
      icon: <RotateCcw />,
      placement: 'overflow',
      scope: 'single',
      run: () => router.push(`${labelDeskHref}return`),
    },
    {
      id: 'replacement-label',
      label: 'Replacement label',
      icon: <Repeat />,
      placement: 'overflow',
      scope: 'single',
      run: () => router.push(`${labelDeskHref}replacement`),
    },
  );
  verbs.push(
    ...buildRecordTaskVerbs({ entityType: 'order', entityId: orderId, label: `Order ${orderRef}` }).map((verb) => ({
      ...verb,
      scope: 'single' as const,
    })),
  );
  if (!openRecord) {
    verbs.push({
      id: 'more-info',
      label: 'More information',
      icon: <Tag />,
      hotkey: MORPHING_MORE_INFO_HOTKEY,
      placement: 'overflow',
      scope: 'single',
      run: () => {
        onFinished();
        dispatchOpenShippedDetails(record, 'queue', { force: true });
      },
    });
  }
  verbs.push({
    id: 'delete',
    label: actionIds.length > 1 ? `Delete ${actionIds.length}` : 'Delete',
    icon: <Trash2 />,
    hotkey: 'd',
    tone: 'danger',
    placement: 'isolated',
    scope: 'both',
    run: deleteOrder,
  });
  return verbs;
}

/** Scan out — who and when (backdated at most `SCAN_OUT_DESK_MAX_BACKDATE_MS`), then Save. */
function ScanOutDisplay({ rows, done }: { rows: readonly ShippedOrder[]; done: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState<number | null>(user?.staffId ?? null);
  const [at, setAt] = useState<Date | undefined>(() => new Date());
  const [saving, setSaving] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const staffRef = useRef<HTMLButtonElement>(null);
  const from = new Date(Date.now() - SCAN_OUT_DESK_MAX_BACKDATE_MS);

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
            alreadyDelivered?: boolean;
            error?: string;
            message?: string;
          } | null;
          if (!res.ok) throw new Error(body?.error || `scan-out ${res.status}`);
          if (body?.matched === false) throw new Error('No shipment found for this label');
          if (body?.blocked) throw new Error(body.message || 'Order is cancelled — do not ship');
          if (body?.alreadyDelivered) throw new Error(body.message || 'Already delivered — scan-out blocked');
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
        toast.success(ok === 1 ? 'Marked as shipped' : `${ok} orders marked as shipped`);
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
      if (ok > 0 && failed === 0) done();
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1" data-testid="order-scan-out-display">
      <Button
        ref={staffRef}
        type="button"
        variant="secondary"
        size="sm"
        radius="pill"
        aria-haspopup="listbox"
        aria-expanded={staffOpen}
        ariaLabel="Staff who scanned out"
        data-testid="order-scan-out-staff"
        onClick={() => setStaffOpen(true)}
      >
        {staffId != null ? (
          <span className="flex min-w-0 items-center gap-2">
            <StaffAvatar staffId={staffId} name={getStaffName(staffId)} size="sm" colorRing alt="" />
            <span className="truncate">{getStaffName(staffId)}</span>
          </span>
        ) : (
          'Staff'
        )}
      </Button>
      <StageStaffAssignPopover
        open={staffOpen}
        onClose={() => setStaffOpen(false)}
        anchorRef={staffRef}
        label="Staff who scanned out"
        role="all"
        selectedStaffId={staffId}
        onCommit={(next) => setStaffId(next)}
      />
      <DateTimePickerField
        value={at}
        onChange={setAt}
        placeholder="Date and time"
        fromDate={from}
        toDate={new Date()}
        className="w-[13.5rem] shrink-0"
      />
      <Button
        type="button"
        variant="success"
        size="sm"
        radius="pill"
        className="ml-auto shrink-0"
        disabled={saving}
        data-testid="order-scan-out-save"
        onClick={save}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

/** Out of stock — pick the short product (a kit's part from its catalog composition), commit. */
function OosDisplay({ rows, done }: { rows: readonly MorphingOosRow[]; done: () => void }) {
  const assign = useOrderAssignment();
  const router = useRouter();
  const [kitByCatalog, setKitByCatalog] = useState<Map<number, KitComposition>>(new Map());
  const [loading, setLoading] = useState(false);

  const catalogKey = rows.map((row) => Number(row.sku_catalog_id) || 0).join(',');
  useEffect(() => {
    const ids = [...new Set(catalogKey.split(',').map(Number).filter((id) => id > 0))];
    if (ids.length === 0) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      ids.map(async (catalogId) => {
        const res = await fetch(`/api/sku-catalog/${catalogId}/composition`);
        const body = (await res.json().catch(() => null)) as { composition?: KitComposition } | null;
        return [catalogId, body?.composition ?? null] as const;
      }),
    )
      .then((pairs) => {
        if (cancelled) return;
        setKitByCatalog(new Map(pairs.filter((pair): pair is readonly [number, KitComposition] => pair[1] != null)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogKey]);

  const commit = (row: MorphingOosRow, identity: OrderShortageIdentity) => {
    const id = morphingOosOrderId(row);
    if (id == null) {
      toast.error('Select an order first');
      return;
    }
    assign.mutate(morphingOosAssignPayload([id], identity), {
      onSuccess: () => {
        showOosPendingToast({
          count: 1,
          sku: identity.sku,
          qtyShort: identity.qtyShort,
          staysPacked: morphingOosStaysPacked([row]),
          onViewPending: () => router.push(SHIPPING_SHORTAGE_PATH),
        });
        done();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not mark out of stock'),
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1" data-testid="order-oos-display">
      <OosProductCombobox
        lines={[...rows]}
        compositionByCatalogId={kitByCatalog}
        disabled={loading}
        onPick={(orderRowId, identity) => {
          const target = rows.find((row) => morphingOosOrderId(row) === orderRowId) ?? rows[0];
          if (target) commit(target, identity);
        }}
      />
    </div>
  );
}

/** Label — link a packing slip / shipping label the packer scan prints, or walk the labels. */
function LabelDisplay({
  record,
  onOpenLabels,
  done,
}: {
  record: ShippedOrder;
  onOpenLabels?: (record: ShippedOrder) => void;
  done: () => void;
}) {
  const queryClient = useQueryClient();
  const slipInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const id = Number(record.id);

  const upload = (documentType: 'packing_slip' | 'shipping_label', file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    form.set('documentType', documentType);
    form.set('orderRef', String(record.order_id || id));
    void fetch(`/api/orders/${id}/documents/upload`, { method: 'POST', body: form }).then(async (res) => {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(body?.error || 'Could not upload the document');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['order-documents', id] });
      refreshDomain('orders.outbound');
      toast.success(
        documentType === 'packing_slip'
          ? 'Packing slip linked — packer scan will print it'
          : 'Shipping label linked — packer scan will print it',
      );
      done();
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-testid="order-label-display">
      <input
        ref={slipInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="sr-only"
        onChange={(event) => {
          upload('packing_slip', event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={labelInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="sr-only"
        onChange={(event) => {
          upload('shipping_label', event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <Button type="button" variant="secondary" size="sm" radius="pill" icon={<FileText />} onClick={() => slipInputRef.current?.click()}>
        Upload packing slip
      </Button>
      <Button type="button" variant="secondary" size="sm" radius="pill" icon={<Truck />} onClick={() => labelInputRef.current?.click()}>
        Upload shipping label
      </Button>
      {onOpenLabels ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          radius="pill"
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

/** Exceptions — paste the item number or listing URL; a unique match backfills the order. */
function ExceptionPasteDisplay({
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

  const commit = (value: string) => {
    const next = value.trim();
    if (!next) return;
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
        onAmbiguous();
        return;
      }
      if (result.outcome === 'saved-item') {
        toast.success('Saved the item number. Open Resolve if it still needs a catalog SKU.');
      } else {
        toast.success(
          result.ordersUpdated > 1
            ? `Matched — backfilled ${result.ordersUpdated} orders.`
            : `Matched ${result.sku} and backfilled the order.`,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['order-exceptions'] });
      done();
    });
  };

  return (
    <div className="min-w-0 max-w-md flex-1" data-testid="exceptions-paste-item-field">
      <SearchField
        value={draft}
        onChange={setDraft}
        onSearch={commit}
        placeholder="Item number or listing URL…"
        autoFocus
        hideLeadingIcon
        hideUnderline
        fillHost
        tone="neutral"
        isSearching={pasting}
        debounceMs={0}
      />
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
}: {
  record: ShippedOrder;
  viewKey: OrderViewKey;
  onOpenLabels?: (record: ShippedOrder) => void;
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
  // Ledger desks: the quick triage verbs as buttons, the record's other
  // actions behind ⋮ (the same list the record repeats below its details).
  // The Shipped package record keeps its full strip.
  const verbs =
    viewKey === 'shipping.shipped'
      ? allVerbs
      : [
          ...allVerbs.filter((verb) => ORDER_BULK_VERB_IDS.has(verb.id)),
          ...recordMoreVerbs(record, allVerbs).map((verb) => ({ ...verb, placement: 'overflow' as const })),
        ];
  const orderRef = String(record.order_id ?? '').trim() || String(record.id);
  return <RecordActionStrip verbs={verbs} label={`Order ${orderRef} actions`} testId="order-record-actions" />;
}

/** Paperwork — label · slip · manuals for the lead order, in one dialog. */
function paperworkVerb(record: ShippedOrder): RecordActionVerb {
  return { id: 'paperwork', label: 'Paperwork', icon: <FileText />, scope: 'single', run: () => dispatchOpenOrderPaperwork(Number(record.id)) };
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
        (verb.run || verb.display) &&
        verb.placement !== 'isolated' &&
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
      anchorRef.current?.closest(`[${SLOT_TABLE_OVERLAY_HOST_ATTR}]`)
      ?? document.querySelector(`[${SLOT_TABLE_OVERLAY_HOST_ATTR}]`);
    const slot = (table ?? document).querySelector(`[${SLOT_TABLE_ACTION_ROW_ATTR}]`);
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
        <BottomSheet
          open={notesOpen}
          onClose={() => setNotesOpen(false)}
          title="Notes"
          forceVariant="sheet"
          compact
          maxWidth="22rem"
        >
          <OrderNotesTrail orderId={Number(record.id)} legacyNote={record.notes} autoFocus variant="compact" />
        </BottomSheet>
      ) : null}
    </>
  );
  return inline ? strip : createPortal(strip, overlayHost as HTMLElement);
}

/**
 * The slot-table host of the order strip — ONE verbs source, two placements:
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
