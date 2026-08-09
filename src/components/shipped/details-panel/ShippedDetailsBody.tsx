'use client';

import {
  DISPLAYS_BODY_INSET,
  DISPLAYS_FLUSH_HOST,
} from '@/design-system/shells/detail-stack/layout';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { DashboardDetailsStack } from '@/components/shipped/stacks/DashboardDetailsStack';
import { TechDetailsStack } from '@/components/shipped/stacks/TechDetailsStack';
import { PackerDetailsStack } from '@/components/shipped/stacks/PackerDetailsStack';
import type { DetailsStackDurationData, ShippedActiveInput } from '@/components/shipped/stacks/types';
import { ShippedDetailsPanelContent, type ShippedActiveSection } from '@/components/shipped/ShippedDetailsPanelContent';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { SerialJourneySection } from '@/components/serial/SerialJourneySection';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { OrderWarrantySection } from '@/components/shipped/details-panel/OrderWarrantySection';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import { OrderUpdateDock } from '@/components/shipped/details-panel/OrderUpdateDock';
import { OrderStationHandoff } from '@/components/shipped/details-panel/OrderStationHandoff';
import type { OrderInspectorContext } from '@/lib/selection-context/order-inspector-context';
import {
  type OrderInspectorDisplayTopic,
  type OrderInspectorUpdateActionKey,
} from '@/lib/shipping/order-inspector-topics';
import { cn } from '@/utils/_cn';

export interface ShippedStackActionBar {
  onClose: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAssign?: () => void;
}

export interface ShippedEditableFields {
  orderNumber: string;
  itemNumber: string;
  trackingNumber: string;
  shipByDate: string;
  isSavingInlineFields: boolean;
  isSavingShipByDate: boolean;
  setOrderNumber: (v: string) => void;
  setItemNumber: (v: string) => void;
  setTrackingNumber: (v: string) => void;
  setShipByDate: (v: string) => void;
  onSaveInline: () => void | Promise<void>;
  onSaveShipByDate: (shipByDate: string) => void | Promise<void>;
}

export interface ShippedDetailsBodyProps {
  context: NonNullable<'dashboard' | 'queue' | 'fulfillment' | 'labels' | 'staged' | 'shipped' | 'station' | 'packer'>;
  /**
   * The ONE descriptor this body reads for plane availability — documents mode,
   * record CTAs, dispatch extras, delete, editor dock. It used to be five
   * separate props plus two locally-derived booleans (`showDashboardDelete`,
   * `showEditorDock`), each re-deriving the lane from `context` in a slightly
   * different way. `resolveOrderInspectorContext` owns that decision now.
   */
  inspectorContext: OrderInspectorContext;
  /** Slide-over: render Warranty/Customer quick-link rows instead of tabs. */
  showQuickLinks?: boolean;
  /**
   * Body section for non-Order topics. Order leaf stacks Shipping + Product
   * (undefined → both sections in {@link ShippedDetailsPanelContent}).
   */
  activeSection: ShippedActiveSection | undefined;
  /** Parent Display topic — Order leaf is one stacked dossier (no nested tabs). */
  displayTopic: OrderInspectorDisplayTopic;
  shipped: ShippedOrder;
  durationData: DetailsStackDurationData;
  copiedAll: boolean;
  onCopyAll: () => void;
  onUpdate: () => void;
  activeInput: ShippedActiveInput;
  setActiveInput: React.Dispatch<React.SetStateAction<ShippedActiveInput>>;
  stackActionBar: ShippedStackActionBar;
  editableFields: ShippedEditableFields;
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
  /**
   * One-shot auto-start for the primary tracking replace editor (queue
   * "Replace tracking"). Forwarded into the dispatch details stack.
   */
  replaceTrackingNonce?: number;
}

/**
 * The scrollable body of the shipped details panel. Detail stacks render in the
 * upper scroll region; header-action editors live in {@link ShippedPanelEditorDock}.
 * Host is flush — content rows own their inset (Unbox Displays grammar).
 */
export function ShippedDetailsBody({
  context,
  inspectorContext,
  showQuickLinks,
  activeSection,
  displayTopic,
  shipped,
  durationData,
  copiedAll,
  onCopyAll,
  onUpdate,
  activeInput,
  setActiveInput,
  stackActionBar,
  editableFields,
  isOutOfStock,
  isSavingOutOfStock,
  onSaveOutOfStock,
  onMarkShippedSuccess,
  isDeleteArmed,
  isDeletingOrder,
  onDeleteOrder,
  updateActions,
  onUpdateAction,
  replaceTrackingNonce = 0,
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

  /** Order leaf = stacked Shipping + Product; other topics keep exclusive section. */
  const stackSection =
    displayTopic === 'order' ? undefined : (activeSection as ShippedActiveSection | undefined);

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
      return <OrderWarrantySection order={shipped} />;
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

    // Order leaf — Shipping + Product stacked (no nested Shipping · Product tabs).
    if (showDispatchExtras) {
      return (
        <DashboardDetailsStack
          shipped={shipped}
          durationData={durationData}
          copiedAll={copiedAll}
          onCopyAll={onCopyAll}
          onUpdate={onUpdate}
          showShippingTimestamp={false}
          activeSection={stackSection}
          showQuickLinks={showQuickLinks}
          replaceTrackingNonce={replaceTrackingNonce}
          flush
        />
      );
    }

    if (context === 'station') {
      return (
        <TechDetailsStack
          shipped={shipped}
          durationData={durationData}
          copiedAll={copiedAll}
          onCopyAll={onCopyAll}
          onUpdate={onUpdate}
          showShippingTimestamp={false}
          actionBar={stackActionBar}
          activeSection={stackSection}
          showQuickLinks={showQuickLinks}
          flush
        />
      );
    }

    if (context === 'packer') {
      return (
        <PackerDetailsStack
          shipped={shipped}
          durationData={durationData}
          copiedAll={copiedAll}
          onCopyAll={onCopyAll}
          onUpdate={onUpdate}
          showShippingTimestamp={false}
          actionBar={stackActionBar}
          activeSection={stackSection}
          showQuickLinks={showQuickLinks}
          flush
        />
      );
    }

    return (
      <div className={cn('flex min-h-full flex-col', DISPLAYS_BODY_INSET, 'pb-6 pt-3')}>
        <div className="flex-1 space-y-4">
          <ShippedDetailsPanelContent
            activeSection={stackSection}
            shipped={{
              ...shipped,
              order_id: editableFields.orderNumber,
              item_number: editableFields.itemNumber,
              shipping_tracking_number: editableFields.trackingNumber,
            }}
            durationData={durationData}
            copiedAll={copiedAll}
            onCopyAll={onCopyAll}
            onUpdate={onUpdate}
            editableShippingFields={{
              orderNumber: editableFields.orderNumber,
              itemNumber: editableFields.itemNumber,
              trackingNumber: editableFields.trackingNumber,
              shipByDate: editableFields.shipByDate,
              isSaving: editableFields.isSavingInlineFields,
              isSavingShipByDate: editableFields.isSavingShipByDate,
              onOrderNumberChange: editableFields.setOrderNumber,
              onItemNumberChange: editableFields.setItemNumber,
              onTrackingNumberChange: editableFields.setTrackingNumber,
              onShipByDateChange: editableFields.setShipByDate,
              onBlur: () => { void editableFields.onSaveInline(); },
              onShipByDateBlur: () => { void editableFields.onSaveShipByDate(editableFields.shipByDate); },
            }}
            showShippingTimestamp={false}
            showQuickLinks={showQuickLinks}
            flush
          />
        </div>
      </div>
    );
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
          shippingTrackingNumber={editableFields.trackingNumber}
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
