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
import { OrderTriageSection } from './OrderTriageSection';
import type {
  OrderInspectorDocumentsMode,
  OrderInspectorRecordCta,
} from '@/lib/selection-context/order-inspector-context';

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
  isFulfillmentPanel: boolean;
  isLabelsPanel: boolean;
  /**
   * Documents plane behaviour, resolved by the panel from
   * `@/lib/selection-context/order-inspector-context` — `manage` is the full
   * Labels tray, `preview` is read-only + the slide-over previewer.
   */
  documentsMode?: OrderInspectorDocumentsMode;
  /** Record-plane hand-offs this context offers (deep-links, never mutations). */
  recordCtas?: readonly OrderInspectorRecordCta[];
  showDashboardExtras: boolean;
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
}

/**
 * The scrollable body of the shipped details panel. Detail stacks render in the
 * upper scroll region; header-action editors live in {@link ShippedPanelEditorDock}.
 */
export function ShippedDetailsBody({
  context,
  isFulfillmentPanel,
  isLabelsPanel,
  documentsMode = isLabelsPanel ? 'manage' : 'preview',
  recordCtas = [],
  showDashboardExtras,
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
}: ShippedDetailsBodyProps) {
  const showDashboardDelete = context === 'dashboard' || isFulfillmentPanel || isLabelsPanel;
  const showEditorDock =
    showDashboardExtras
    || context === 'staged'
    || context === 'station'
    || context === 'packer'
    || context === 'shipped';

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

    if (context === 'dashboard' || isFulfillmentPanel || isLabelsPanel) {
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

  const deleteFooter = showDashboardDelete ? (
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

  const showTriage = showDashboardDelete && Number(shipped.id) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {/*
          Record-plane triage — the shared row flag + the attributed note
          trail. ABOVE the tab body, not inside one tab: both are facts about
          the record, and this panel's default tab is per-record
          (`resolveOrderInspectorContext`), so a tab-scoped placement meant the
          operator had to already know which tab to look under. The grid shows
          that a row is flagged or annotated; this is the one place that says
          which tag, why, and who wrote the notes.
        */}
        {showTriage ? (
          <div className="pt-4">
            <OrderTriageSection
              orderId={Number(shipped.id)}
              flag={shipped.row_flag?.flag}
              flagSetBy={shipped.row_flag?.by}
              legacyNote={shipped.notes}
            />
          </div>
        ) : null}
        {scrollContent}
      </div>

      {showEditorDock ? (
        <ShippedPanelEditorDock
          shipped={shipped}
          activeInput={activeInput}
          setActiveInput={setActiveInput}
          showMarkAsShipped={showDashboardExtras}
          showOutOfStock={showDashboardExtras}
          /* One composer per panel: when the triage section above already
             mounts the trail, the dock must not mount a second one for the
             same store. */
          showNotes={!showTriage}
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
