import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  canEditShippingInfo,
  resolveShippedRowEditTarget,
} from '@/components/shipped/details-panel/shipped-details-logic';
import { findDuplicateTrackingInDraft, normalizeShipByDraft } from '../helpers';
import type { EditableShippingFields, FlatTrackingRow, ShippingInfoEditDraft } from '../types';
import type { useOrderFieldSave } from '@/hooks/useOrderFieldSave';

type OrderFieldSave = ReturnType<typeof useOrderFieldSave>;

interface UseShippingInfoEditModalArgs {
  shipped: ShippedOrder;
  ef: EditableShippingFields;
  allTrackingRows: FlatTrackingRow[];
  serialNumberRows: string[];
  internalFieldSave: OrderFieldSave;
  onUpdate?: () => void;
  setLinkedTrackingDrafts: Dispatch<SetStateAction<Record<string, string>>>;
}

function mapShippingSaveError(message: string, isException: boolean): string {
  const trimmed = String(message || '').trim();
  if (!trimmed) return 'Failed to save shipping details';
  if (/order not found/i.test(trimmed) && !isException) {
    return "This order record couldn't be found. Close and re-open the panel to refresh.";
  }
  if (/already exists on another shipment/i.test(trimmed)) {
    return 'Tracking number already exists on another shipment.';
  }
  if (/already exists on another exception/i.test(trimmed)) {
    return 'Tracking number already exists on another exception.';
  }
  return trimmed;
}

/**
 * Owns the "Edit Order Details" modal: draft state, opening (seeding the draft
 * from the live record) and the multi-step save that fans changes out across
 * the record, tracking sub-resource and serial APIs before busting caches.
 */
export function useShippingInfoEditModal({
  shipped,
  ef,
  allTrackingRows,
  serialNumberRows,
  internalFieldSave,
  onUpdate,
  setLinkedTrackingDrafts,
}: UseShippingInfoEditModalArgs) {
  const queryClient = useQueryClient();
  const editTarget = resolveShippedRowEditTarget(shipped);
  const exceptionMode = editTarget?.kind === 'exception';
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [isSaveSuccess, setIsSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShippingInfoEditDraft>({
    shipByDate: '',
    orderNumber: '',
    itemNumber: '',
    trackingRows: [],
    serialRows: [],
  });

  const syncOrderExceptions = async () => {
    const res = await fetch('/api/orders-exceptions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || data?.message || 'Failed to sync orders exceptions');
    }
  };

  const openEditModal = useCallback(() => {
    if (!canEditShippingInfo(shipped)) return;
    const target = resolveShippedRowEditTarget(shipped);
    if (target?.kind === 'exception') {
      const tracking = String(
        allTrackingRows[0]?.tracking
        || shipped.shipping_tracking_number
        || '',
      ).trim();
      setDraft({
        shipByDate: '',
        orderNumber: '',
        itemNumber: '',
        trackingRows: [{ shipmentId: null, tracking }],
        serialRows: [],
      });
    } else {
      setDraft({
        shipByDate: normalizeShipByDraft(ef.shipByDate),
        orderNumber: ef.orderNumber,
        itemNumber: ef.itemNumber,
        trackingRows: allTrackingRows.length > 0
          ? allTrackingRows.map((row) => ({ shipmentId: row.shipmentId, tracking: row.tracking }))
          : [{ shipmentId: null, tracking: '' }],
        serialRows: serialNumberRows.length > 0 ? serialNumberRows.map((row) => row.toUpperCase()) : [''],
      });
    }
    setError(null);
    setIsSaveSuccess(false);
    setIsOpen(true);
  }, [
    allTrackingRows,
    ef.itemNumber,
    ef.orderNumber,
    ef.shipByDate,
    serialNumberRows,
    shipped,
  ]);

  const requestClose = useCallback(() => {
    if (isSaving || isSaveSuccess) return;
    setIsOpen(false);
    setIsSaveSuccess(false);
    setError(null);
  }, [isSaving, isSaveSuccess]);

  const saveSerialRowsFromModal = useCallback(async (serials: string[], trackingOverride?: string) => {
    const trackingNumber = String(trackingOverride || shipped.shipping_tracking_number || '').trim();
    const fnskuLogId = shipped.fnsku_log_id ?? null;
    const salId = shipped.sal_id ?? null;

    if (!trackingNumber && !fnskuLogId && !salId) {
      throw new Error('Tracking number or scan session is required to update serials.');
    }

    const response = salId
      ? await fetch('/api/tech/serial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            salId,
            serials,
            techId: shipped.tested_by ?? shipped.tester_id ?? null,
          }),
        })
      : await fetch('/api/tech/update-serials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tracking: trackingNumber || null,
            serialNumbers: serials,
            techId: shipped.tested_by ?? shipped.tester_id ?? null,
            fnskuLogId,
          }),
        });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      throw new Error(data?.details || data?.error || 'Failed to update serials');
    }

    queryClient.invalidateQueries({ queryKey: ['tech-logs'] });
  }, [queryClient, shipped.fnsku_log_id, shipped.sal_id, shipped.shipping_tracking_number, shipped.tested_by, shipped.tester_id]);

  const handleModalSave = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setIsSaveSuccess(false);
    setError(null);
    try {
      const duplicate = findDuplicateTrackingInDraft(draft.trackingRows);
      if (duplicate) {
        throw new Error('Same tracking number entered more than once.');
      }

      const target = resolveShippedRowEditTarget(shipped);

      // ── Exception path: tracking-only PATCH on orders_exceptions ──────────
      if (target?.kind === 'exception') {
        const nextTracking = String(draft.trackingRows[0]?.tracking || '').trim();
        if (!nextTracking) {
          throw new Error('Tracking number is required.');
        }
        const currentTracking = String(
          allTrackingRows[0]?.tracking || shipped.shipping_tracking_number || '',
        ).trim();
        if (nextTracking.toUpperCase() !== currentTracking.toUpperCase()) {
          const res = await fetch(`/api/orders-exceptions/${target.exceptionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shippingTrackingNumber: nextTracking }),
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(String(payload?.details || payload?.error || 'Failed to update tracking'));
          }
        }
        ef.onTrackingNumberChange(nextTracking);
        setLinkedTrackingDrafts({ 'none:0': nextTracking });
        setIsSaveSuccess(true);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['orders'] }),
          queryClient.invalidateQueries({ queryKey: ['shipped-table'] }),
          queryClient.invalidateQueries({ queryKey: ['shipped-table-fba'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-table'] }),
        ]);
        onUpdate?.();
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        setIsOpen(false);
        setIsSaveSuccess(false);
        return;
      }

      if (!target || target.kind !== 'order') {
        throw new Error(
          "This order record couldn't be found. Close and re-open the panel to refresh.",
        );
      }

      const currentOrderId = target.orderId;

      // ── 1. Record fields → canonical CRUD ────────────────────────────────
      const recordPatch: Record<string, unknown> = {};
      if (draft.itemNumber.trim() !== String(ef.itemNumber || '').trim()) {
        recordPatch.itemNumber = draft.itemNumber.trim() || null;
      }
      if (Object.keys(recordPatch).length > 0) {
        const res = await fetch(`/api/orders/${currentOrderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordPatch),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(String(payload?.details || payload?.error || 'Failed to save order fields'));
        }
      }

      if (draft.orderNumber.trim() !== String(ef.orderNumber || '').trim()) {
        const res = await fetch('/api/orders/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: currentOrderId, orderNumber: draft.orderNumber.trim() }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(String(payload?.error || payload?.details || 'Failed to save order ID'));
        }
      }

      if (normalizeShipByDraft(draft.shipByDate) !== normalizeShipByDraft(ef.shipByDate)) {
        await internalFieldSave.saveShipByDate(draft.shipByDate);
      }

      // ── 2. Tracking → desired-state reconcile ────────────────────────────
      const desiredTracking = draft.trackingRows
        .map((row) => String(row.tracking || '').trim())
        .filter(Boolean);
      const currentTracking = allTrackingRows
        .map((row) => String(row.tracking || '').trim())
        .filter(Boolean);

      const trackingSetKey = (rows: string[]) => rows.map((t) => t.toUpperCase()).join('\n');
      const trackingTouched = trackingSetKey(desiredTracking) !== trackingSetKey(currentTracking);

      let trackingChanged = false;
      if (trackingTouched) {
        const res = await fetch(`/api/orders/${currentOrderId}/tracking`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setTrackingNumbers: desiredTracking }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(String(payload?.details || payload?.error || 'Failed to update tracking'));
        }

        trackingChanged = true;
      }

      // ── 3. Save serial numbers ────────────────────────────────────────────
      const nextSerialRows = draft.serialRows
        .map((row) => row.trim().toUpperCase())
        .filter(Boolean);
      const currentSerialRows = serialNumberRows.map((row) => row.trim().toUpperCase()).filter(Boolean);
      const firstDraftTracking = draft.trackingRows[0]?.tracking || '';
      if (nextSerialRows.join(', ') !== currentSerialRows.join(', ')) {
        await saveSerialRowsFromModal(nextSerialRows, firstDraftTracking);
      }

      // ── 4. Reflect draft into local component state ───────────────────────
      if (draft.orderNumber !== ef.orderNumber) {
        ef.onOrderNumberChange(draft.orderNumber);
      }
      if (draft.itemNumber !== ef.itemNumber) {
        ef.onItemNumberChange(draft.itemNumber);
      }
      if (firstDraftTracking !== ef.trackingNumber) {
        ef.onTrackingNumberChange(firstDraftTracking);
      }
      if (draft.shipByDate !== ef.shipByDate) {
        ef.onShipByDateChange(draft.shipByDate);
      }

      setLinkedTrackingDrafts(() => {
        const next: Record<string, string> = {};
        draft.trackingRows.forEach((row, index) => {
          const key = `${row.shipmentId ?? 'none'}:${index}`;
          next[key] = row.tracking;
        });
        return next;
      });

      setIsSaveSuccess(true);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['shipped-table'] }),
        queryClient.invalidateQueries({ queryKey: ['shipped-table-fba'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-table'] }),
      ]);

      onUpdate?.();

      await new Promise((resolve) => window.setTimeout(resolve, 400));

      setIsOpen(false);
      setIsSaveSuccess(false);

      if (trackingChanged) {
        void syncOrderExceptions().catch((syncError) => {
          console.error('Background orders exception sync failed:', syncError);
        });
      }
    } catch (saveError) {
      const raw = saveError instanceof Error ? saveError.message : 'Failed to save shipping details';
      setError(mapShippingSaveError(raw, exceptionMode));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [
    allTrackingRows,
    draft,
    ef,
    exceptionMode,
    internalFieldSave,
    onUpdate,
    queryClient,
    saveSerialRowsFromModal,
    serialNumberRows,
    setLinkedTrackingDrafts,
    shipped,
  ]);

  return {
    isOpen,
    draft,
    setDraft,
    isSaving,
    isSaveSuccess,
    error,
    exceptionMode,
    openEditModal,
    requestClose,
    handleModalSave,
  };
}
