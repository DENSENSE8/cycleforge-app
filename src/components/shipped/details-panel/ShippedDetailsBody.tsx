'use client';

import { Trash2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
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
import { DeleteOrderControl } from '@/components/shipped/stacks/DeleteOrderControl';
import { ShippedPanelEditorDock } from '@/components/shipped/details-panel/ShippedPanelEditorDock';
import { OrderStationHandoff } from '@/components/shipped/details-panel/OrderStationHandoff';
import type { OrderInspectorContext } from '@/lib/selection-context/order-inspector-context';

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
  activeSection: ShippedActiveSection;
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
  /**
   * One-shot auto-start for the primary tracking replace editor (queue
   * "Replace tracking"). Forwarded into the dispatch details stack.
   */
  replaceTrackingNonce?: number;
}

/**
 * The scrollable body of the shipped details panel. Detail stacks render in the
 * upper scroll region; header-action editors live in {@link ShippedPanelEditorDock}.
 */
export function ShippedDetailsBody({
  context,
  inspectorContext,
  showQuickLinks,
  activeSection,
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

  const scrollContent = (() => {
    if (activeSection === 'documents' && shipped?.id) {
      return (
        <div className="flex min-h-full flex-col gap-4 pb-8 pt-4">
          <OrderDocumentsSection
            orderId={Number(shipped.id)}
            orderRef={shipped.order_id || `order-${shipped.id}`}
            readOnly={documentsMode !== 'manage'}
            showPreview={documentsMode === 'preview'}
          />
          {/* The pre-pack hand-off sits under the paperwork it gates: labels +
              slip present → the order can move to Testing. One quiet deep-link,
              not a CTA repeated per document. */}
          <OrderStationHandoff order={shipped} ctas={recordCtas} />
        </div>
      );
    }

    if (activeSection === 'warranty') {
      return (
        <div className="px-6">
          <OrderWarrantySection order={shipped} />
        </div>
      );
    }

    if (activeSection === 'conversation' && shipped?.id) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <ThreadPanel entityType="ORDER" entityId={Number(shipped.id)} />
        </div>
      );
    }

    if (activeSection === 'timeline' && shipped?.id) {
      return (
        <div className="flex min-h-full flex-col pb-8 pt-2">
          <div className="flex-1 pt-2">
            <OrderTimelineSection orderId={Number(shipped.id)} />
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

    // The dispatch lanes (dashboard / queue / fulfillment / labels) share one
    // stack; station and packer have their own below.
    if (showDispatchExtras) {
      return (
        <DashboardDetailsStack
          shipped={shipped}
          durationData={durationData}
          copiedAll={copiedAll}
          onCopyAll={onCopyAll}
          onUpdate={onUpdate}
          showShippingTimestamp={false}
          activeSection={activeSection}
          showQuickLinks={showQuickLinks}
          replaceTrackingNonce={replaceTrackingNonce}
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
          activeSection={activeSection}
          showQuickLinks={showQuickLinks}
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
          activeSection={activeSection}
          showQuickLinks={showQuickLinks}
        />
      );
    }

    return (
      <div className="flex min-h-full flex-col pb-8 pt-4">
        <div className="flex-1 space-y-4">
          <ShippedDetailsPanelContent
            activeSection={activeSection}
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
          />
        </div>
      </div>
    );
  })();

  const deleteFooter = showDelete ? (
    <section className="mx-8 shrink-0 pb-8 pt-2 space-y-2">
      <DeleteOrderControl
        orderId={shipped.id}
        packerLogId={(shipped as { packer_log_id?: number }).packer_log_id ?? null}
        stationActivityLogId={
          (shipped as { station_activity_log_id?: number }).station_activity_log_id
          ?? (shipped as { sal_id?: number }).sal_id
          ?? null
        }
        trackingType={shipped.tracking_type}
        onDeleted={() => onUpdate?.()}
      />
    </section>
  ) : context === 'shipped' ? (
    <section className="mx-8 shrink-0 pb-8 pt-2">
      <Button
        type="button"
        variant="danger"
        size="lg"
        onClick={onDeleteOrder}
        disabled={isDeletingOrder}
        icon={<Trash2 className="w-3.5 h-3.5" />}
        className={`w-full rounded-xl bg-red-600 hover:bg-red-700 ${sectionLabel} text-white tracking-wider disabled:opacity-50`}
      >
        {isDeletingOrder
          ? 'Deleting...'
          : isDeleteArmed
            ? 'Click Again To Confirm'
            : 'Delete'}
      </Button>
    </section>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {/*
          NO triage block and NO note composer in this panel (handoff §3.2).
          `OrderTriageSection` (row flag + attributed note trail) used to mount
          here, with the dock reading `showNotes={!showTriage}` beneath it — so
          turning the section off alone would have MOVED the composer into the
          dock rather than removing it. Both are off.

          Note-writing now lives only on `/o/[orderId]`, reached from the
          open-full-page action in the header's icon row. The write path itself
          is unchanged and still governed by `order-note-grain.guard.test.ts`:
          `order_notes` via `POST /api/orders/[id]/notes`, one writable home.
        */}
        {scrollContent}
      </div>

      {showEditorDock ? (
        <ShippedPanelEditorDock
          shipped={shipped}
          activeInput={activeInput}
          setActiveInput={setActiveInput}
          showMarkAsShipped={showDispatchExtras}
          showOutOfStock={showDispatchExtras}
          /* Hard off — see the §3.2 note above. This used to be
             `!showTriage`, which is why removing the triage section alone
             would have relocated the composer instead of removing it. */
          showNotes={false}
          isOutOfStock={isOutOfStock}
          isSavingOutOfStock={isSavingOutOfStock}
          onSaveOutOfStock={onSaveOutOfStock}
          shippingTrackingNumber={editableFields.trackingNumber}
          onMarkShippedSuccess={onMarkShippedSuccess}
        />
      ) : null}

      {deleteFooter}
    </div>
  );
}
