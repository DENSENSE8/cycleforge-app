'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { useDeleteOrderRow } from '@/hooks';
import { useOrderFieldSave } from '@/hooks/useOrderFieldSave';
import type { ShippedActiveSection } from '@/components/shipped/stacks/types';
import type { ShippedActiveInput } from '@/components/shipped/stacks/types';
import { resolveDeleteRequest, toMonthDayYearCurrent } from '@/components/shipped/details-panel/shipped-details-logic';
import {
  orderInspectorActiveSection,
  resolveOrderInspectorDisplayTopic,
  resolveOrderInspectorTopicState,
  type OrderInspectorDisplayTopic,
  type OrderInspectorOrderChild,
} from '@/lib/shipping/order-inspector-topics';
import { toast } from '@/lib/toast';

/** Owns the panel's working copy of the order plus the inline-editable shipping fields (order #, item #, tracking, ship-by date). */
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
    // Note: this used to flush an unsaved note draft for the OUTGOING record before re-seeding (the panel swaps content in place on queue j/k…
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
  /** The opening leaf section, resolved by the caller from the contextual SoT (`resolveOrderInspectorContext(...).defaultTab` in… */
  defaultSection?: ShippedActiveSection;
  /** Documents tab gate — when false, a documents default falls back to Order. */
  showDocumentsTab?: boolean;
}

/**
 * The panel's view state — Display topic + Order nested child (body leaf), plus
 * the lifted inline-editor toggles. Resets when the underlying order changes.
 */
export function useShippedPanelViewState({
  initialShipped,
  defaultSection = 'shipping',
  showDocumentsTab = true,
}: UseShippedPanelViewStateOptions) {
  const seed = resolveOrderInspectorTopicState(defaultSection);
  const [displayTopic, setDisplayTopicState] = useState<OrderInspectorDisplayTopic>(
    resolveOrderInspectorDisplayTopic(seed.topic, { showDocumentsTab }),
  );
  const [orderChild, setOrderChild] = useState<OrderInspectorOrderChild>(seed.orderChild);
  const [activeInput, setActiveInput] = useState<ShippedActiveInput>('none');

  const activeSection = orderInspectorActiveSection(displayTopic, orderChild);

  const setDisplayTopic = useCallback(
    (topic: OrderInspectorDisplayTopic) => {
      setDisplayTopicState(
        resolveOrderInspectorDisplayTopic(topic, { showDocumentsTab }),
      );
    },
    [showDocumentsTab],
  );

  /** Leaf setter for replace-tracking / legacy callers — maps to topic + child. */
  const setActiveSection = useCallback(
    (section: ShippedActiveSection) => {
      const next = resolveOrderInspectorTopicState(section);
      setDisplayTopicState(
        resolveOrderInspectorDisplayTopic(next.topic, { showDocumentsTab }),
      );
      setOrderChild(next.orderChild);
    },
    [showDocumentsTab],
  );

  // Reset to the context default when the underlying order changes (e.g. user
  // navigates to a different order via the panel's up/down arrows). Pending
  // re-opens on Documents per record — the question the lane exists to answer.
  useEffect(() => {
    const next = resolveOrderInspectorTopicState(defaultSection);
    setDisplayTopicState(
      resolveOrderInspectorDisplayTopic(next.topic, { showDocumentsTab }),
    );
    setOrderChild(next.orderChild);
  }, [initialShipped.id, defaultSection, showDocumentsTab]);

  useEffect(() => {
    setActiveInput('none');
  }, [initialShipped.id]);

  return {
    displayTopic,
    setDisplayTopic,
    orderChild,
    setOrderChild,
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
