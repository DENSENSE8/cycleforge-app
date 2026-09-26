'use client';

import {
  DISPLAYS_BODY_INSET,
  DISPLAYS_FLUSH_HOST,
} from '@/design-system/shells/detail-stack/layout';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import type {
  ShippedActiveInput,
  ShippedActiveSection,
} from '@/components/shipped/stacks/types';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { SerialJourneySection } from '@/components/serial/SerialJourneySection';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { OrderWarrantySummary } from '@/components/order-record/OrderWarrantySummary';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { OrderUpdateDock } from '@/components/shipped/details-panel/OrderUpdateDock';
import { OrderStationHandoff } from '@/components/shipped/details-panel/OrderStationHandoff';
import type { OrderInspectorContext } from '@/lib/selection-context/order-inspector-context';
import {
  type OrderInspectorDisplayTopic,
  type OrderInspectorUpdateActionKey,
} from '@/lib/shipping/order-inspector-topics';
import { cn } from '@/utils/_cn';

export interface ShippedDetailsBodyProps {
  context: NonNullable<'dashboard' | 'queue' | 'fulfillment' | 'labels' | 'staged' | 'shipped' | 'station' | 'packer' | 'packed'>;
  /** The ONE descriptor this body reads for plane availability — documents mode, record CTAs, dispatch extras, delete, editor dock. */
  inspectorContext: OrderInspectorContext;
  /** Body section for non-Order topics. */
  activeSection: ShippedActiveSection | undefined;
  /** Parent Display topic — Order leaf is one stacked dossier (no nested tabs). */
  displayTopic: OrderInspectorDisplayTopic;
  shipped: ShippedOrder;
  onUpdate: () => void;
  activeInput: ShippedActiveInput;
  setActiveInput: React.Dispatch<React.SetStateAction<ShippedActiveInput>>;
  isOutOfStock: boolean;
  isSavingOutOfStock: boolean;
  onSaveOutOfStock: (checked: boolean) => void | Promise<void>;
  onMarkShippedSuccess: () => void;
  isDeleteArmed: boolean;
  isDeletingOrder: boolean;
  onDeleteOrder: () => void;
  /** Order-tab bottom update CTAs (Assign · urgent · notes · …). */
  updateActions: ReadonlyArray<{ key: OrderInspectorUpdateActionKey; label: string }>;
  onUpdateAction: (key: OrderInspectorUpdateActionKey) => void;
}

/** The scrollable body of the shipped details panel. */
export function ShippedDetailsBody({
  context,
  inspectorContext,
  activeSection,
  displayTopic,
  shipped,
  onUpdate,
  activeInput,
  setActiveInput,
  isOutOfStock,
  isSavingOutOfStock,
  onSaveOutOfStock,
  onMarkShippedSuccess,
  isDeleteArmed,
  isDeletingOrder,
  onDeleteOrder,
  updateActions,
  onUpdateAction,
}: ShippedDetailsBodyProps) {
  const { documentsMode, recordCtas, showDispatchExtras, showDelete, showEditorDock } =
    inspectorContext;

  const orderSerials = [
    ...new Set(
      String(shipped.serial_number || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  const scrollContent = (() => {
    if (displayTopic === 'documents' && shipped?.id) {
      return (
        <div className={cn('flex min-h-full flex-col gap-4', DISPLAYS_BODY_INSET, 'pb-6 pt-3')}>
          <OrderDocumentsSection
            orderId={Number(shipped.id)}
            orderRef={shipped.order_id || `order-${shipped.id}`}
            readOnly={documentsMode !== 'manage'}
            showPreview={documentsMode === 'preview'}
            flush
          />
          {/* The pre-pack hand-off sits under the paperwork it gates: labels +
              slip present → the order can move to Testing. One quiet deep-link,
              not a CTA repeated per document. */}
          <OrderStationHandoff order={shipped} ctas={recordCtas} flush />
        </div>
      );
    }

    if (activeSection === 'warranty') {
      return <OrderWarrantySummary order={shipped} density="pane" />;
    }

    if (displayTopic === 'conversation' && shipped?.id) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <ThreadPanel entityType="ORDER" entityId={Number(shipped.id)} />
        </div>
      );
    }

    if (displayTopic === 'timeline' && shipped?.id) {
      return (
        <div className={cn('flex min-h-full flex-col', DISPLAYS_BODY_INSET, 'pb-6 pt-2')}>
          <div className="flex-1 pt-1">
            <OrderTimelineSection orderId={Number(shipped.id)} flush />
            {orderSerials.map((sn) => (
              <SerialJourneySection
                key={sn}
                serialNumber={sn}
                title={orderSerials.length > 1 ? `Item Journey · ${sn}` : 'Item Journey'}
              />
            ))}
          </div>
        </div>
      );
    }

    // Order leaf — no body. The dossier stack was retired; the update dock below
    // is all that remains of this topic.
    return null;
  })();

  const showOrderUpdateDock = displayTopic === 'order';
  const showDeleteInDock = showOrderUpdateDock && (showDelete || context === 'shipped');

  return (
    <div className={cn(DISPLAYS_FLUSH_HOST, 'flex min-h-0 flex-1 flex-col')} data-order-inspector-body="">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {scrollContent}
      </div>

      {showOrderUpdateDock ? (
        <OrderUpdateDock
          shipped={shipped}
          actions={updateActions}
          activeInput={activeInput}
          setActiveInput={setActiveInput}
          onAction={onUpdateAction}
          showEditorDock={showEditorDock && showDispatchExtras}
          isOutOfStock={isOutOfStock}
          isSavingOutOfStock={isSavingOutOfStock}
          onSaveOutOfStock={onSaveOutOfStock}
          shippingTrackingNumber={shipped.shipping_tracking_number || ''}
          onMarkShippedSuccess={onMarkShippedSuccess}
          onAssigned={onUpdate}
          showDelete={showDeleteInDock}
          isDeleteArmed={isDeleteArmed}
          isDeleting={isDeletingOrder}
          onDelete={onDeleteOrder}
        />
      ) : null}
    </div>
  );
}
