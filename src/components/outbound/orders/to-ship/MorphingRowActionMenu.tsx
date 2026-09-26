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
import { useDeskRecordPlaneOptional } from '@/design-system/components/DeskRecordPlane';
import {
  AlertTriangle,
  Bookmark,
  Copy,
  FileText,
  Printer,
  Tag,
  Trash2,
  Truck,
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
import type { OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';
import type { KitComposition } from '@/lib/orders/order-kit-composition';
import type { OrderRecordMode } from '@/lib/selection-context/order-inspector-context';
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

/** The open record's own controls, when the strip is armed for it. */
export interface OrderOpenRecordControls {
  /** The open order is in the bulk check-set. */
  checked: boolean;
  onToggleSelect?: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  /** To Ship: the paperwork walk on this order. */
  onOpenLabels?: (record: ShippedOrder) => void;
}

export interface OrderActionVerbsOptions {
  /** The lead order (the open record, or the first checked row). */
  record: ShippedOrder;
  /** The orders the verbs act on — the check-set, or `[record]`. */
  rows: readonly ShippedOrder[];
  /** The freshest copies of `rows` — state labels read these. */
  stateRows: readonly ShippedOrder[];
  mode: OrderRecordMode;
  /** Present when armed for the open record (adds Select, the Labels walk, tasks). */
  openRecord?: OrderOpenRecordControls;
  /** Mobile URL: Notes opens the sheet instead of morphing the strip. */
  onOpenNotesSheet?: () => void;
  /** A verb that ends the strip's job (Delete, Resolve, More information). */
  onFinished: () => void;
}

/** Every order verb for the strip, mode-aware, over `rows`. */
export function useOrderActionVerbs({
  record,
  rows,
  stateRows,
  mode,
  openRecord,
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
  const shipped = mode === 'shipped';
  const single = actionRows.length <= 1;
  const orderRef = String(record.order_id ?? '').trim() || `#${record.id}`;

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
    assign.mutate(
      { orderIds: actionIds, isUrgent: next },
      {
        onSuccess: () => toast.success(next ? 'Marked urgent — pinned to top' : 'Urgent cleared'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update urgent'),
      },
    );
  };

  const selectionIsOutOfStock = stateRows.length > 0 && stateRows.every(isOutOfStockRow);
  const clearOutOfStock = () => {
    assign.mutate(
      { orderIds: actionIds, isOutOfStock: false },
      {
        onSuccess: () =>
          toast.success(actionIds.length === 1 ? 'Out of stock cleared' : 'Cleared out of stock on selected orders'),
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
    if (stage && !stage.fullscreen) stage.toggleFullscreen();
    const params = new URLSearchParams(searchParams.toString());
    params.set('order', String(record.id));
    router.replace(`${SHIPPING_EXCEPTIONS_PATH}?${params.toString()}`, { scroll: false });
  };

  const deleteOrder = async () => {
    onFinished();
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
        const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
        toast.error(body.error ?? body.details ?? 'Could not delete the order');
        return;
      }
      bustFulfillmentCaches(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['order-exceptions'] });
      toast.success('Order deleted');
    } catch {
      toast.error('Could not delete the order');
    }
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

  if (mode === 'exceptions') {
    verbs.push({
      id: 'paste',
      label: 'Paste item #',
      hotkey: 'v',
      display: (done) => (
        <ExceptionPasteDisplay record={record} onAmbiguous={openExceptionResolve} done={done} />
      ),
    });
    // The record's own Resolve section is the open record's pairing form.
    if (!openRecord) verbs.push({ id: 'resolve', label: 'Resolve', hotkey: 'r', run: openExceptionResolve });
  }
  if (!shipped) {
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
    verbs.push({
      id: 'urgent',
      label: selectionIsUrgent ? 'Clear urgent' : 'Mark urgent',
      icon: <Zap />,
      hotkey: 'u',
      pressed: selectionIsUrgent,
      run: markUrgent,
    });
  }
  verbs.push({
    id: 'label',
    label: 'Label',
    icon: <FileText />,
    hotkey: 'l',
    display: (done) => (
      <LabelDisplay record={record} onOpenLabels={openRecord?.onOpenLabels} done={done} />
    ),
  });
  verbs.push({
    id: 'scan-out',
    label: scanOut?.label ?? 'Mark scanned out',
    icon: <Truck />,
    hotkey: 'x',
    disabled: scanOut?.disabled,
    disabledReason: scanOut?.reason,
    ...(scanOut?.direction === 'undo'
      ? { run: undoScanOut }
      : { display: (done: () => void) => <ScanOutDisplay rows={actionRows} done={done} /> }),
  });
  verbs.push(
    onOpenNotesSheet
      ? { id: 'notes', label: 'Notes', hotkey: MORPHING_NOTES_HOTKEY, run: onOpenNotesSheet }
      : {
          id: 'notes',
          label: 'Notes',
          hotkey: MORPHING_NOTES_HOTKEY,
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
      run: () => toggle(record, { shiftKey: false }),
    });
  }
  verbs.push(...catalogVerb('copy', 'Copy', <Copy />, 'c'));
  verbs.push(...catalogVerb('print', 'Print', <Printer />, 'p'));

  // ── ⋮ overflow ──
  if (!shipped) {
    verbs.push({
      id: 'create-rule',
      label: 'Create rule',
      icon: <Bookmark />,
      hotkey: mode === 'exceptions' ? undefined : 'r',
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
  if (single) {
    verbs.push(
      ...buildRecordTaskVerbs({ entityType: 'order', entityId: orderId, label: `Order ${orderRef}` }),
    );
  }
  if (!openRecord) {
    verbs.push({
      id: 'more-info',
      label: 'More information',
      icon: <Tag />,
      hotkey: MORPHING_MORE_INFO_HOTKEY,
      placement: 'overflow',
      run: () => {
        onFinished();
        dispatchOpenShippedDetails(record, 'queue', { force: true });
      },
    });
  }
  if (single) {
    verbs.push({
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 />,
      hotkey: 'd',
      tone: 'danger',
      placement: 'isolated',
      run: deleteOrder,
    });
  }
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
  mode,
  checked = false,
  onToggleSelect,
  onOpenLabels,
}: {
  record: ShippedOrder;
  mode: OrderRecordMode;
} & Partial<OrderOpenRecordControls>) {
  const verbs = useOrderActionVerbs({
    record,
    rows: [record],
    stateRows: [record],
    mode,
    openRecord: { checked, onToggleSelect, onOpenLabels },
    onFinished: () => undefined,
  });
  const orderRef = String(record.order_id ?? '').trim() || `#${record.id}`;
  return <RecordActionStrip verbs={verbs} label={`Order ${orderRef} actions`} testId="order-record-actions" />;
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
export function MorphingRowActionMenu({
  record,
  open,
  onClose,
  anchorRef,
  inline = false,
  liveRecords,
  mode,
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
  /** The desk; defaults from the route (Exceptions) else To Ship. */
  mode?: OrderRecordMode;
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

  const verbs = useOrderActionVerbs({
    record,
    rows: actionRows,
    stateRows,
    mode: mode ?? (pathname === SHIPPING_EXCEPTIONS_PATH ? 'exceptions' : 'to-ship'),
    onOpenNotesSheet: onMobileUrl ? () => setNotesOpen(true) : undefined,
    onFinished: close,
  });

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
        onDismiss={selectedRows.length === 0 ? close : undefined}
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
 * The slot-table host of the order strip (`DataTable` `actionStrip`): the
 * check-set strip while rows are checked, else the open record's strip when
 * the list sits in a record plane with a record open.
 */
export function OrdersMorphingHost({
  records,
  selectedIds,
  mode,
  openRecordStrip,
}: {
  records: ShippedOrder[];
  selectedIds: ReadonlySet<number>;
  mode: OrderRecordMode;
  /** The open record's strip, from the desk that owns the open record. */
  openRecordStrip?: ReactNode;
}) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const { rows, scope } = useRailActionSnapshot();
  const plane = useDeskRecordPlaneOptional();
  const record =
    (rows[0] as ShippedOrder | undefined)
    ?? records.find((row) => selectedIds.has(Number(row.id)));
  if (!record) return plane?.open ? <>{openRecordStrip}</> : null;
  return (
    <MorphingRowActionMenu
      record={record}
      open
      inline
      mode={mode}
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
