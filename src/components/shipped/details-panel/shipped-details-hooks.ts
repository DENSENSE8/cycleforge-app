'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { buildShippedCopyInfo } from '@/utils/copyallshipped';
import { useDeleteOrderRow } from '@/hooks';
import { useOrderFieldSave } from '@/hooks/useOrderFieldSave';
import { useWorkOrderAssignment } from '@/hooks/useWorkOrderAssignment';
import { WorkOrderAssignmentCard, type AssignmentConfirmPayload } from '@/components/work-orders/WorkOrderAssignmentCard';
import type { ShippedActiveSection } from '@/components/shipped/ShippedDetailsPanelContent';
import type { ShippedActiveInput } from '@/components/shipped/stacks/types';
import { resolveDeleteRequest, toMonthDayYearCurrent } from '@/components/shipped/details-panel/shipped-details-logic';
import { toast } from '@/lib/toast';

// Re-exported so consumers of WorkOrderAssignmentCard's confirm payload can find it here.
export type { AssignmentConfirmPayload };

/**
 * Owns the panel's working copy of the order plus the inline-editable shipping
 * fields (order #, item #, tracking, ship-by date). Resyncs everything whenever
 * the underlying order changes (e.g. up/down navigation), and exposes the save
 * actions backed by {@link useOrderFieldSave}.
 */
export function useShippedDetailState(initialShipped: ShippedOrder, onUpdate: () => void) {
  const [shipped, setShipped] = useState<ShippedOrder>(initialShipped);
  const [shipByDate, setShipByDate] = useState('');
  const [orderNumber, setOrderNumber] = useState(initialShipped.order_id || '');
  const [itemNumber, setItemNumber] = useState(initialShipped.item_number || '');
  const [shippingTrackingNumber, setShippingTrackingNumber] = useState(initialShipped.shipping_tracking_number || '');
  const [isOutOfStock, setIsOutOfStock] = useState(
    Boolean((initialShipped as { is_out_of_stock?: boolean }).is_out_of_stock),
  );

  const fieldSave = useOrderFieldSave({
    orderId: shipped.id,
    initialOrderNumber: initialShipped.order_id || '',
    initialItemNumber: initialShipped.item_number || '',
    initialTrackingNumber: initialShipped.shipping_tracking_number || '',
    onUpdate,
  });
  const {
    isSavingInlineFields,
    isSavingOutOfStock,
    isSavingShipByDate,
    saveInlineFields: persistInlineFields,
    saveOutOfStock,
    saveShipByDate,
    resetRefs,
  } = fieldSave;

  useEffect(() => {
    // Note: this used to flush an unsaved note draft for the OUTGOING record
    // before re-seeding (the panel swaps content in place on queue j/k
    // navigation — `display/motion-crossfade.md` → queue-processing inspector).
    // Notes are no longer a panel-held draft over a scalar column: they append
    // to `order_notes` on submit, so there is nothing left that a record swap
    // could silently discard. The rest of the re-seed is unchanged.
    setShipped(initialShipped);
    const preferredDate = String(initialShipped.ship_by_date || '').trim() || initialShipped.created_at || '';
    setShipByDate(toMonthDayYearCurrent(preferredDate));
    setOrderNumber(initialShipped.order_id || '');
    setItemNumber(initialShipped.item_number || '');
    setShippingTrackingNumber(initialShipped.shipping_tracking_number || '');
    setIsOutOfStock(Boolean((initialShipped as { is_out_of_stock?: boolean }).is_out_of_stock));
    resetRefs(
      initialShipped.order_id || '',
      initialShipped.item_number || '',
      initialShipped.shipping_tracking_number || '',
    );
  }, [initialShipped, resetRefs]);

  const saveInlineFields = useCallback(async () => {
    await persistInlineFields(orderNumber, itemNumber, shippingTrackingNumber);
  }, [itemNumber, orderNumber, persistInlineFields, shippingTrackingNumber]);

  const saveOutOfStockIfChanged = useCallback(async () => {
    const initialValue = Boolean((initialShipped as { is_out_of_stock?: boolean }).is_out_of_stock);
    if (isOutOfStock === initialValue) return;
    await saveOutOfStock(isOutOfStock);
    setShipped((current) => ({ ...current, is_out_of_stock: isOutOfStock } as ShippedOrder));
  }, [initialShipped, isOutOfStock, saveOutOfStock, setShipped]);

  const handleSaveOutOfStock = useCallback(async (
    checked: boolean,
    onSaved?: () => void,
  ) => {
    const currentSaved = Boolean((shipped as { is_out_of_stock?: boolean }).is_out_of_stock);
    setIsOutOfStock(checked);
    if (checked === currentSaved) {
      onSaved?.();
      return;
    }
    try {
      await saveOutOfStock(checked);
      setShipped((current) => ({ ...current, is_out_of_stock: checked } as ShippedOrder));
      onSaved?.();
    } catch (error) {
      console.error('Failed to save out of stock:', error);
      setIsOutOfStock(Boolean((shipped as { is_out_of_stock?: boolean }).is_out_of_stock));
    }
  }, [isOutOfStock, saveOutOfStock, setIsOutOfStock, setShipped, shipped]);

  useEffect(() => {
    const handleClose = () => {
      void (async () => {
        await saveOutOfStockIfChanged();
        await saveInlineFields();
      })();
    };
    window.addEventListener('close-shipped-details' as keyof WindowEventMap, handleClose as EventListener);
    return () => window.removeEventListener('close-shipped-details' as keyof WindowEventMap, handleClose as EventListener);
  }, [saveInlineFields, saveOutOfStockIfChanged]);

  return {
    shipped,
    setShipped,
    orderNumber,
    setOrderNumber,
    itemNumber,
    setItemNumber,
    shippingTrackingNumber,
    setShippingTrackingNumber,
    isOutOfStock,
    shipByDate,
    setShipByDate,
    isSavingInlineFields,
    isSavingOutOfStock,
    isSavingShipByDate,
    saveInlineFields,
    saveShipByDate,
    saveOutOfStockIfChanged,
    handleSaveOutOfStock,
  };
}

export interface UseShippedPanelViewStateOptions {
  initialShipped: ShippedOrder;
  /**
   * The opening tab, resolved by the caller from the contextual SoT
   * (`resolveOrderInspectorContext(...).defaultTab` in
   * `@/lib/selection-context/order-inspector-context`) — Pending / fulfillment
   * opens docs-first, the search deep-link opens journey-first, everything else
   * keeps `shipping`. The hook does not re-decide it; one decider, one place.
   */
  defaultSection?: ShippedActiveSection;
}

/**
 * The panel's view state — the active tab plus the lifted inline-editor toggles
 * (out-of-stock / notes input, mark-as-shipped). Resets to sensible defaults
 * when the underlying order changes.
 */
export function useShippedPanelViewState({
  initialShipped,
  defaultSection = 'shipping',
}: UseShippedPanelViewStateOptions) {
  const [activeSection, setActiveSection] = useState<ShippedActiveSection>(defaultSection);
  const [activeInput, setActiveInput] = useState<ShippedActiveInput>('none');

  // Reset to the context default when the underlying order changes (e.g. user
  // navigates to a different order via the panel's up/down arrows). Pending
  // re-opens on Documents per record — the question the lane exists to answer.
  useEffect(() => {
    setActiveSection(defaultSection);
  }, [initialShipped.id, defaultSection]);

  useEffect(() => {
    setActiveInput('none');
  }, [initialShipped.id]);

  return {
    activeSection,
    setActiveSection,
    activeInput,
    setActiveInput,
  };
}

/**
 * Two-step (arm → confirm) permanent delete for a shipped row. The first call
 * arms for 3s; the second performs the resolved delete (exception / packing
 * log / order) and calls `onUpdate`.
 */
export function useShippedDeletion(shipped: ShippedOrder, onUpdate: () => void) {
  const [isDeleteArmed, setIsDeleteArmed] = useState(false);
  const deleteOrderMutation = useDeleteOrderRow();

  const handleDelete = useCallback(async () => {
    const request = resolveDeleteRequest(shipped);
    if (!request) return;

    if (!isDeleteArmed) {
      setIsDeleteArmed(true);
      window.setTimeout(() => setIsDeleteArmed(false), 3000);
      return;
    }

    setIsDeleteArmed(false);
    try {
      await deleteOrderMutation.mutateAsync(request);
      onUpdate();
    } catch (error) {
      console.error('Failed to delete shipped order:', error);
      toast.error('Failed to permanently delete order. Please try again.');
    }
  }, [shipped, isDeleteArmed, deleteOrderMutation, onUpdate]);

  return { isDeleteArmed, isDeleting: deleteOrderMutation.isPending, handleDelete };
}

export interface UseShippedAssignmentOptions {
  shipped: ShippedOrder;
  setShipped: React.Dispatch<React.SetStateAction<ShippedOrder>>;
  onUpdate: () => void;
}

/**
 * Work-order assignment: loads today's present staff on demand, derives the
 * technician / packer option lists, and persists tech/packer/deadline changes
 * (optimistically updating the local order and firing refresh events).
 */
export function useShippedAssignment({ shipped: _shipped, setShipped, onUpdate }: UseShippedAssignmentOptions) {
  const [showAssignmentCard, setShowAssignmentCard] = useState(false);

  // Staff options + the /api/work-orders write live in the shared waist, so the
  // dashboard bulk bar and this panel can never drift into two writers.
  const { technicianOptions, packerOptions, loadStaff, confirmAssignment } = useWorkOrderAssignment({
    onAssigned: (_row, payload) => {
      setShipped((current) => ({
        ...current,
        tester_id: payload.techId,
        packer_id: payload.packerId,
        ship_by_date: payload.deadline ?? current.ship_by_date,
        deadline_at: payload.deadline ?? current.deadline_at,
      }));
      onUpdate();
    },
  });

  const openAssignmentCard = useCallback(async () => {
    if (await loadStaff()) setShowAssignmentCard(true);
  }, [loadStaff]);

  return {
    showAssignmentCard,
    setShowAssignmentCard,
    openAssignmentCard,
    handleAssignmentConfirm: confirmAssignment,
    technicianOptions,
    packerOptions,
  };
}

/** Transient "copied ✓" feedback for the copy-all and copy-order-id actions. */
export function useShippedCopyActions(shipped: ShippedOrder, orderIdDisplay: string) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(false);

  const handleCopyAll = useCallback(() => {
    const allInfo = buildShippedCopyInfo(shipped);
    navigator.clipboard.writeText(allInfo);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }, [shipped]);

  const handleCopyOrderId = useCallback(() => {
    const value = orderIdDisplay.trim();
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopiedOrderId(true);
    setTimeout(() => setCopiedOrderId(false), 1500);
  }, [orderIdDisplay]);

  return { copiedAll, copiedOrderId, handleCopyAll, handleCopyOrderId };
}

// Re-export so the panel composition can render the card without a separate import.
export { WorkOrderAssignmentCard };
