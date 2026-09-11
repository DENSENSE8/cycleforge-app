'use client';

/**
 * CYC-82 — the row action manifold that opens off the leading checkbox.
 *
 * ## Where it paints
 *
 * Sticky action row under the column headers (portaled into DataTable /
 * LedgerGrid {@link SLOT_TABLE_ACTION_ROW_ATTR} under
 * {@link SLOT_TABLE_OVERLAY_HOST_ATTR}). Idle the slot is `empty:hidden`.
 * Armed, it grows below Order / Item / Dates and pushes the sheet — it does
 * not cover or replace the column labels. Clicking off either side of the
 * table does not dismiss it — selection does. Primary verbs stay left.
 * Overflow is a ⋮ menu. Delete is isolated on the far right so a mis-click
 * on assign cannot void the order.
 *
 * ## No confirm step
 *
 * Picking a staffer COMMITS. There is no Confirm/Deny view — a second press to
 * agree with the press you just made is a step that teaches nothing, and the
 * write is already optimistic and visible on the row behind the panel.
 *
 * Delete is the one exception, and it is still not a confirm BUTTON: the same
 * row re-labels and takes a second press, so an irreversible verb cannot fire
 * on a mis-click without adding a control to the panel.
 *
 * ## Roster
 *
 * Faces come from {@link StaffAvatar} keyed on staff id, so each staffer paints
 * in their assigned colour with their photo when they have one — the operator
 * reads the colour, not the name. Who may appear is
 * {@link morphingRoster}: packers are Tuan and Thuy, pickers are live staff
 * named Sang / Ajax / Lien / Michael, and Kai is never either.
 *
 * Notes stays a pill on this one-row strip. Press (or `N`) morphs the strip
 * into a one-row composer (`notes-view` + {@link OrderNotesTrail}
 * `variant="strip"`). A {@link BottomSheet} (`forceVariant="sheet"` + compact
 * trail) opens only on a mobile URL (`/m/` via {@link isMorphingMobileUrl}).
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import {
  AlertTriangle,
  Bookmark,
  FileText,
  MoreHorizontal,
  Trash2,
  Truck,
  Upload,
  Zap,
} from '@/components/Icons';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { bustFulfillmentCaches, bustScanOutCaches } from '@/lib/outbound/outbound-cache-keys';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  applyMorphingGutterClick,
  isMorphingMobileUrl,
  MORPHING_MORE_INFO_HOTKEY,
  MORPHING_NOTES_HOTKEY,
} from '@/lib/outbound/morphing-row-action';
import { rememberRowPlaneOpen } from '@/components/tables/compound/compound-row-plane';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { dispatchOpenShippedDetails, dispatchOpenListingStaffRules } from '@/utils/events';
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
import { useSelectionInlineHotkeysRevealed } from '@/hooks/useSelectionStatusBarHotkeys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { pushOverlay } from '@/lib/overlay-stack/store';
import { useRailActionSnapshot } from '@/components/right-rail/RailSelectionActions';
import { resolveSelectionAction } from '@/lib/selection/selection-actions';
import { showOosPendingToast } from '@/lib/outbound/oos-pending-toast';
import {
  morphingListingIdentity,
  morphingOosAssignPayload,
  morphingOosOrderId,
  morphingOosStartView,
  morphingOosStaysPacked,
  type MorphingOosRow,
} from '@/lib/outbound/morphing-oos';
import type { OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';
import type { KitComposition } from '@/lib/orders/order-kit-composition';
import { OosProductCombobox } from '@/components/outbound/orders/oos/OosProductCombobox';

type MenuView =
  | 'actions'
  | 'paste'
  | 'docs'
  | 'notes'
  | 'scan-out'
  | 'oos-pick';

function viewKey(view: MenuView): string {
  if (view === 'paste') return 'paste-view';
  if (view === 'docs') return 'docs-view';
  if (view === 'notes') return 'notes-view';
  if (view === 'scan-out') return 'scan-out-view';
  if (view === 'oos-pick') return 'oos-pick-view';
  return 'actions-view';
}

function asOosRow(row: unknown): MorphingOosRow {
  if (!row || typeof row !== 'object') return {};
  return row as MorphingOosRow;
}

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

/**
 * The ENGINE-facing face of this panel — what `TableSurfaceBinding.rowPlane`
 * registers for the orders entity.
 *
 * The engine mounts a plane as `{ row, open, onClose, anchorRef }`; this panel
 * has always called its row `record`. One rename adapter, declared beside the
 * panel it adapts, rather than a new file or a churned prop name on 700 lines
 * of working operator surface.
 *
 * Registering it here is what let `OrdersQueueTableRow` go: the panel was the
 * last thing the shared compound row could not mount, so To-ship kept a row
 * component alive to host it.
 */
export function OrdersRowPlane({ row, ...plane }: TableRowPlaneProps<ShippedOrder>) {
  return <MorphingRowActionMenu record={row} {...plane} />;
}

export function MorphingRowActionMenu({
  record,
  open,
  onClose,
  anchorRef,
  inline = false,
}: {
  record: ShippedOrder;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** Mounted outside the virtualized row window. Portals into the in-flow
   *  slot under the column header so the labels stay visible. */
  inline?: boolean;
}) {
  const [view, setView] = useState<MenuView>('actions');
  const [notesOpen, setNotesOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [pasteDraft, setPasteDraft] = useState('');
  const [pasting, setPasting] = useState(false);
  const [oosTarget, setOosTarget] = useState<MorphingOosRow | null>(null);
  const [kitByCatalog, setKitByCatalog] = useState<Map<number, KitComposition>>(new Map());
  const [kitPartsLoading, setKitPartsLoading] = useState(false);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hadSelection = useRef(false);
  const slipInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const assign = useOrderAssignment();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stage = useDeskStageOptional();
  const onExceptionsDesk = pathname === SHIPPING_EXCEPTIONS_PATH;
  const onMobileUrl = isMorphingMobileUrl(pathname);

  const orderId = Number(record.id);
  const { rows: selectedRows, actions: catalogActions } = useRailActionSnapshot();
  const actionRows = selectedRows.length > 0 ? selectedRows : [record];
  const actionIds = actionRows.map(orderIdOf).filter((id): id is number => id != null);
  const scanOutAction = catalogActions.find((action) => action.key === 'scan-out');
  const listingRuleAction = catalogActions.find((action) => action.key === 'listing-rule');
  const scanOutResolved = scanOutAction
    ? resolveSelectionAction(scanOutAction, actionRows)
    : null;
  const scanOutLive = scanOutResolved && !scanOutResolved.disabled ? scanOutResolved : null;
  const { user } = useAuth();
  const [scanOutStaffId, setScanOutStaffId] = useState<number | null>(null);
  const [scanOutAt, setScanOutAt] = useState<Date | undefined>(() => new Date());
  const [scanOutSaving, setScanOutSaving] = useState(false);
  const [scanOutStaffOpen, setScanOutStaffOpen] = useState(false);
  const scanOutStaffRef = useRef<HTMLButtonElement>(null);
  const deskScanOutFrom = new Date(Date.now() - SCAN_OUT_DESK_MAX_BACKDATE_MS);

  const finishScanOutWrites = (ok: number, failed: number, results: PromiseSettledResult<void>[]) => {
    if (ok > 0) {
      bustScanOutCaches(queryClient);
      refreshDomain('orders.outbound');
      toast.success(ok === 1 ? 'Marked as shipped' : `${ok} orders marked as shipped`);
    }
    if (failed > 0) {
      const first = results.find((row) => row.status === 'rejected');
      const reason =
        first && first.status === 'rejected' && first.reason instanceof Error
          ? first.reason.message
          : `${failed} of ${results.length} could not be updated`;
      toast.error(reason);
    }
  };

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

  const openScanOut = () => {
    setDeleteArmed(false);
    if (scanOutResolved?.direction === 'undo') {
      undoScanOut();
      return;
    }
    setScanOutStaffId(user?.staffId ?? null);
    setScanOutAt(new Date());
    setView('scan-out');
  };

  const saveScanOut = () => {
    if (scanOutSaving) return;
    if (scanOutStaffId == null) {
      toast.error('Select a staffer');
      return;
    }
    if (!scanOutAt || Number.isNaN(scanOutAt.getTime())) {
      toast.error('Pick a date and time');
      return;
    }
    const jobs = actionRows
      .map((row) => trackingOf(row))
      .filter((tracking): tracking is string => Boolean(tracking))
      .map((trackingNumber) =>
        fetch('/api/shipped/scan-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackingNumber,
            staffId: scanOutStaffId,
            createdAt: scanOutAt.toISOString(),
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
    setScanOutSaving(true);
    void Promise.allSettled(jobs).then((results) => {
      const failed = results.filter((row) => row.status === 'rejected').length;
      const ok = results.length - failed;
      finishScanOutWrites(ok, failed, results);
      setScanOutSaving(false);
      if (ok > 0 && failed === 0) setView('actions');
    });
  };

  const runListingRule = () => {
    if (listingRuleAction) {
      void listingRuleAction.run(actionRows);
      return;
    }
    dispatchOpenListingStaffRules();
  };

  const openDocs = () => {
    setDeleteArmed(false);
    setView('docs');
  };

  const uploadDocument = (documentType: 'packing_slip' | 'shipping_label', file: File | undefined) => {
    if (!file) return;
    const id = actionIds[0] ?? orderId;
    if (!id) {
      toast.error('Select an order first');
      return;
    }
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
      toast.success(
        documentType === 'packing_slip'
          ? 'Packing slip linked — packer scan will print it'
          : 'Shipping label linked — packer scan will print it',
      );
    });
  };

  const close = () => {
    setView('actions');
    setNotesOpen(false);
    setDeleteArmed(false);
    setPasteDraft('');
    setPasting(false);
    setOosTarget(null);
    setKitByCatalog(new Map());
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    rememberRowPlaneOpen(true);
    setView('actions');
    setNotesOpen(false);
    setDeleteArmed(false);
    setPasteDraft('');
    setPasting(false);
    setOosTarget(null);
    setKitByCatalog(new Map());
    return () => rememberRowPlaneOpen(false);
  }, [open]);

  const openExceptionPaste = () => {
    setDeleteArmed(false);
    setPasteDraft('');
    setView('paste');
  };

  const openExceptionResolve = () => {
    close();
    if (stage && !stage.fullscreen) stage.toggleFullscreen();
    const params = new URLSearchParams(searchParams.toString());
    params.set('order', String(record.id));
    const qs = params.toString();
    router.replace(qs ? `${SHIPPING_EXCEPTIONS_PATH}?${qs}` : SHIPPING_EXCEPTIONS_PATH, {
      scroll: false,
    });
  };

  const commitExceptionPaste = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setPasting(true);
    void commitExceptionsItemPaste(next, [
      {
        id: orderId,
        itemNumber: record.item_number ?? null,
        accountSource: record.account_source ?? null,
      },
    ]).then(async (result) => {
      setPasting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.outcome === 'ambiguous') {
        toast.error('Several catalog matches — pick one in Resolve.');
        openExceptionResolve();
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
      close();
    });
  };

  const openNotes = () => {
    setDeleteArmed(false);
    if (onMobileUrl) {
      setNotesOpen(true);
      return;
    }
    setView('notes');
  };

  const backToActions = () => {
    setView('actions');
    setNotesOpen(false);
    setDeleteArmed(false);
    setPasteDraft('');
    setOosTarget(null);
    setKitByCatalog(new Map());
    setScanOutSaving(false);
    setScanOutStaffOpen(false);
  };

  const openMoreInformation = () => {
    close();
    dispatchOpenShippedDetails(record, 'queue', { force: true });
  };

  const selectionIsUrgent = actionRows.length > 0 && actionRows.every(isUrgentRow);

  const markUrgent = () => {
    const ids = actionIds.length > 0 ? actionIds : [orderId].filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length === 0) {
      toast.error('Select an order first');
      return;
    }
    const next = !selectionIsUrgent;
    assign.mutate(
      { orderIds: ids, isUrgent: next },
      {
        onSuccess: () => toast.success(next ? 'Marked urgent — pinned to top' : 'Urgent cleared'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update urgent'),
      },
    );
  };

  const commitOutOfStock = (rows: MorphingOosRow[], identity: OrderShortageIdentity) => {
    const ids = rows
      .map(morphingOosOrderId)
      .filter((id): id is number => id != null);
    if (ids.length === 0) {
      toast.error('Select an order first');
      return;
    }
    const staysPacked = morphingOosStaysPacked(rows);
    assign.mutate(morphingOosAssignPayload(ids, identity), {
      onSuccess: () => {
        showOosPendingToast({
          count: ids.length,
          sku: identity.sku,
          qtyShort: identity.qtyShort,
          staysPacked,
          onViewPending: () => router.push(SHIPPING_SHORTAGE_PATH),
        });
        backToActions();
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Could not mark out of stock'),
    });
  };

  const loadKitCompositions = (rows: MorphingOosRow[]) => {
    const ids = Array.from(
      new Set(
        rows
          .map((row) => Number(row.sku_catalog_id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (ids.length === 0) return;
    setKitPartsLoading(true);
    void Promise.all(
      ids.map(async (catalogId) => {
        const res = await fetch(`/api/sku-catalog/${catalogId}/composition`);
        const body = (await res.json().catch(() => null)) as { composition?: KitComposition } | null;
        return [catalogId, body?.composition ?? null] as const;
      }),
    )
      .then((pairs) => {
        setKitByCatalog((prev) => {
          const next = new Map(prev);
          for (const [id, composition] of pairs) {
            if (composition) next.set(id, composition);
          }
          return next;
        });
      })
      .finally(() => setKitPartsLoading(false));
  };

  const openOutOfStock = () => {
    setDeleteArmed(false);
    const rows = (actionRows.length > 0 ? actionRows : [record]).map(asOosRow);
    const start = morphingOosStartView(rows);
    if (start === 'commit-multi') {
      const staysPacked = morphingOosStaysPacked(rows);
      const ids = rows.map(morphingOosOrderId).filter((id): id is number => id != null);
      if (ids.length === 0) {
        toast.error('Select an order first');
        return;
      }
      void Promise.all(
        rows.map(
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
        .then(() => {
          showOosPendingToast({
            count: ids.length,
            staysPacked,
            onViewPending: () => router.push(SHIPPING_SHORTAGE_PATH),
          });
          backToActions();
        })
        .catch((err) =>
          toast.error(err instanceof Error ? err.message : 'Could not mark out of stock'),
        );
      return;
    }
    setOosTarget(rows[0] ?? asOosRow(record));
    loadKitCompositions(rows);
    setView('oos-pick');
  };

  const deleteOrder = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    close();
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (res.status === 403) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          body.error === 'STEPUP_REQUIRED'
            ? 'Deleting an order needs a PIN step-up first'
            : 'You do not have permission to delete an order',
        );
        return;
      }
      if (!res.ok) {
        toast.error('Could not delete the order');
        return;
      }
      bustFulfillmentCaches(queryClient);
      toast.success('Order deleted');
    } catch {
      toast.error('Could not delete the order');
    }
  };

  useLayoutEffect(() => {
    if (inline) return;
    if (!open) {
      setOverlayHost(null);
      return;
    }
    const grid =
      anchorRef.current?.closest(`[${SLOT_TABLE_OVERLAY_HOST_ATTR}]`)
      ?? document.querySelector(`[${SLOT_TABLE_OVERLAY_HOST_ATTR}]`);
    const slot =
      grid instanceof Element
        ? grid.querySelector(`[${SLOT_TABLE_ACTION_ROW_ATTR}]`)
        : document.querySelector(`[${SLOT_TABLE_ACTION_ROW_ATTR}]`);
    setOverlayHost(slot instanceof HTMLElement ? slot : null);
  }, [open, anchorRef, inline]);

  const showHotkeys = useSelectionInlineHotkeysRevealed();

  useEffect(() => {
    if (!open) return;
    return pushOverlay();
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    const actionByLetter = new Map<string, () => void>([
      ['u', markUrgent],
      ['o', openOutOfStock],
      ['r', runListingRule],
      [MORPHING_NOTES_HOTKEY.toLowerCase(), openNotes],
      [MORPHING_MORE_INFO_HOTKEY.toLowerCase(), openMoreInformation],
      ['x', openScanOut],
      ['d', () => void deleteOrder()],
    ]);
    if (onExceptionsDesk) {
      actionByLetter.set('v', openExceptionPaste);
      actionByLetter.set('r', openExceptionResolve);
    }
    const onKey = (event: KeyboardEvent) => {
      const key = event.key;
      if (key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (notesOpen) {
          setNotesOpen(false);
          return;
        }
        if (view === 'paste' || view === 'docs' || view === 'notes' || view === 'scan-out' || view.startsWith('oos-')) {
          backToActions();
          return;
        }
        if (selectedRows.length === 0) close();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyTarget(event.target)) return;
      if (notesOpen) return;
      if (view !== 'actions') return;
      const letter = key.length === 1 ? key.toLowerCase() : '';
      const run = actionByLetter.get(letter);
      if (!run) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      run();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open || (!inline && !overlayHost)) return null;
  const overlay = (
    <>
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Row actions"
      data-testid="morphing-row-action-menu"
      data-view={viewKey(view)}
      className={
        view === 'notes' || view === 'scan-out' || view.startsWith('oos-')
          ? 'flex w-full min-w-0 flex-nowrap items-center gap-1 bg-surface-card px-1 py-1.5'
          : 'flex w-full min-w-0 flex-wrap items-center gap-1 bg-surface-card px-1 py-1.5'
      }
    >
      <AnimatePresence mode="sync" initial={false}>
        {view === 'actions' ? (
          <motion.div key="actions-view" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {onExceptionsDesk ? (
                <>
                  <Button type="button" variant="execute" size="sm" radius="pill" onClick={openExceptionPaste}>
                    Paste item #
                  </Button>
                  <Button type="button" variant="execute" size="sm" radius="pill" onClick={openExceptionResolve}>
                    Resolve
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="yellow"
                size="sm"
                radius="pill"
                icon={<Zap />}
                data-testid="morphing-urgent"
                aria-pressed={selectionIsUrgent}
                onClick={markUrgent}
              >
                {selectionIsUrgent ? 'Urgent' : 'Mark urgent'}
              </Button>
              <Button
                type="button"
                variant="dangerSoft"
                size="sm"
                radius="pill"
                icon={<AlertTriangle />}
                data-testid="morphing-out-of-stock"
                onClick={openOutOfStock}
              >
                Out of stock
              </Button>
              <Button
                type="button"
                variant="primarySoft"
                size="sm"
                radius="pill"
                icon={<Bookmark />}
                title="Item number → picker and packer. Repeats when that listing is ordered again."
                data-testid="morphing-create-rule"
                onClick={runListingRule}
              >
                Create rule
              </Button>
              <Button
                type="button"
                variant="execute"
                size="sm"
                radius="pill"
                icon={<FileText />}
                data-testid="morphing-notes"
                aria-haspopup={onMobileUrl ? 'dialog' : undefined}
                aria-expanded={onMobileUrl ? notesOpen : false}
                onClick={openNotes}
              >
                Notes
              </Button>
              <Button type="button" variant="execute" size="sm" radius="pill" icon={<Upload />} onClick={openDocs} data-testid="morphing-upload-docs">
                Upload docs
              </Button>
              <Button
                type="button"
                variant="success"
                size="sm"
                radius="pill"
                icon={<Truck />}
                title={scanOutLive?.reason ?? (actionRows.length > 1 ? `${actionRows.length} selected` : 'Mark scanned out')}
                data-testid="morphing-scan-out"
                onClick={openScanOut}
              >
                {scanOutLive?.label ?? 'Mark scanned out'}
              </Button>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    type="button"
                    size="sm"
                    radius="pill"
                    tone="neutral"
                    icon={<MoreHorizontal className="h-3.5 w-3.5" />}
                    ariaLabel="More actions"
                    data-testid="morphing-row-more-actions"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom">
                  <DropdownMenuItem onSelect={openMoreInformation}>
                    More information
                    {showHotkeys ? (
                      <KeyboardKey aria-hidden size="sm" className="ml-auto">
                        {MORPHING_MORE_INFO_HOTKEY}
                      </KeyboardKey>
                    ) : null}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="danger"
                size="sm"
                radius="pill"
                icon={<Trash2 />}
                data-testid="morphing-row-delete"
                onClick={() => void deleteOrder()}
              >
                {deleteArmed ? 'Delete — press again' : 'Delete'}
              </Button>
            </div>
          </motion.div>
          ) : view === 'notes' ? (
            <motion.div
              key="notes-view"
              className="flex min-w-0 flex-1 flex-nowrap items-center gap-1"
              data-testid="morphing-notes-view"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                backToActions();
              }}
            >
              <Button type="button" variant="ghost" size="sm" onClick={backToActions}>
                Back
              </Button>
              <OrderNotesTrail
                orderId={orderId}
                legacyNote={record.notes}
                autoFocus
                variant="strip"
                className="min-w-0 flex-1"
              />
            </motion.div>
          ) : view === 'scan-out' ? (
            <motion.div
              key="scan-out-view"
              className="flex min-w-0 flex-1 flex-nowrap items-center gap-1"
              data-testid="morphing-scan-out-view"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                backToActions();
              }}
            >
              <Button type="button" variant="ghost" size="sm" onClick={backToActions}>
                Back
              </Button>
              <Button
                ref={scanOutStaffRef}
                type="button"
                variant="secondary"
                size="sm"
                radius="pill"
                aria-haspopup="listbox"
                aria-expanded={scanOutStaffOpen}
                ariaLabel="Staff who scanned out"
                data-testid="morphing-scan-out-staff"
                onClick={() => setScanOutStaffOpen(true)}
              >
                {scanOutStaffId != null ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <StaffAvatar
                      staffId={scanOutStaffId}
                      name={getStaffName(scanOutStaffId)}
                      size="sm"
                      colorRing
                      alt=""
                    />
                    <span className="truncate">{getStaffName(scanOutStaffId)}</span>
                  </span>
                ) : (
                  'Staff'
                )}
              </Button>
              <StageStaffAssignPopover
                open={scanOutStaffOpen}
                onClose={() => setScanOutStaffOpen(false)}
                anchorRef={scanOutStaffRef}
                label="Staff who scanned out"
                role="all"
                selectedStaffId={scanOutStaffId}
                onCommit={(staffId) => setScanOutStaffId(staffId)}
              />
              <DateTimePickerField
                value={scanOutAt}
                onChange={setScanOutAt}
                placeholder="Date and time"
                fromDate={deskScanOutFrom}
                toDate={new Date()}
                className="w-[13.5rem] shrink-0"
              />
              <Button
                type="button"
                variant="success"
                size="sm"
                radius="pill"
                className="ml-auto shrink-0"
                disabled={scanOutSaving}
                data-testid="morphing-scan-out-save"
                onClick={saveScanOut}
              >
                {scanOutSaving ? 'Saving…' : 'Save'}
              </Button>
            </motion.div>
          ) : view === 'docs' ? (
            <motion.div key="docs-view" className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-testid="morphing-docs-view">
              <Button type="button" variant="ghost" size="sm" onClick={backToActions}>
                Back
              </Button>
              <input
                ref={slipInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(event) => {
                  uploadDocument('packing_slip', event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
              <input
                ref={labelInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(event) => {
                  uploadDocument('shipping_label', event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
              <Button type="button" variant="execute" size="sm" radius="pill" icon={<FileText />} onClick={() => slipInputRef.current?.click()}>
                Packing slip
              </Button>
              <Button type="button" variant="success" size="sm" radius="pill" icon={<Truck />} onClick={() => labelInputRef.current?.click()}>
                Shipping label
              </Button>
            </motion.div>
          ) : view === 'oos-pick' ? (
            <motion.div
              key="oos-pick-view"
              className="flex min-w-0 flex-1 flex-nowrap items-center gap-1"
              data-testid="morphing-oos-pick-view"
            >
              <Button type="button" variant="ghost" size="sm" onClick={backToActions}>
                Back
              </Button>
              <OosProductCombobox
                lines={(actionRows.length > 0 ? actionRows : [record]).map(asOosRow)}
                compositionByCatalogId={kitByCatalog}
                disabled={kitPartsLoading}
                onPick={(orderRowId, identity) => {
                  const rows = (actionRows.length > 0 ? actionRows : [record]).map(asOosRow);
                  const target = rows.find((row) => morphingOosOrderId(row) === orderRowId) ?? oosTarget ?? asOosRow(record);
                  commitOutOfStock([target], identity);
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="paste-view"
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
              data-testid="exceptions-paste-item-field"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                backToActions();
              }}
            >
              <Button type="button" variant="ghost" size="sm" onClick={backToActions}>
                Back
              </Button>
              <div className="min-w-0 max-w-md flex-1">
                <SearchField
                  value={pasteDraft}
                  onChange={setPasteDraft}
                  onSearch={commitExceptionPaste}
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
            </motion.div>
          )}
        </AnimatePresence>
    </div>
    {onMobileUrl ? (
    <BottomSheet
      open={notesOpen}
      onClose={() => setNotesOpen(false)}
      title="Notes"
      forceVariant="sheet"
      compact
      maxWidth="22rem"
    >
      <OrderNotesTrail
        orderId={orderId}
        legacyNote={record.notes}
        autoFocus
        variant="compact"
      />
    </BottomSheet>
    ) : null}
    </>
  );

  return inline ? overlay : createPortal(overlay, overlayHost as HTMLElement);
}

/**
 * Desktop mount — lives in the spreadsheet `bodyPrefix` so selection from
 * the rail snapshot keeps the bar up after the checked row recycles. The
 * DOM portals into the in-flow slot under the column header (`SLOT_TABLE_ACTION_ROW_ATTR`).
 */
export function OrdersMorphingHost({
  records,
  selectedIds,
}: {
  records: ShippedOrder[];
  selectedIds: ReadonlySet<number>;
}) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const { rows, scope } = useRailActionSnapshot();
  const record =
    (rows[0] as ShippedOrder | undefined)
    ?? records.find((row) => selectedIds.has(Number(row.id)));
  if (!record) return null;
  return (
    <MorphingRowActionMenu
      record={record}
      open
      onClose={() => {
        if (scope) emitToggleAll(scope, 'none');
      }}
      anchorRef={anchorRef}
    />
  );
}


/**
 * Mobile stack gutter — its own checkbox, so the manifold comes with it.
 * The desktop grid does NOT come through here: it paints its leading track via
 * the shared compound engine, which takes data and not JSX, so the desk row
 * mounts {@link MorphingRowActionMenu}, which portals into the in-flow slot
 * under the column header.
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
