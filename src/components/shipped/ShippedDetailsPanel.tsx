'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { dispatchNavigateShippedDetails } from '@/utils/events';
import { usePanelActions } from '@/hooks/usePanelActions';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { WorkOrderAssignmentCard } from '@/components/work-orders/WorkOrderAssignmentCard';
import { type PaneHeaderActionBarAction } from '@/components/ui/pane-header';
import type { DetailsStackDurationData, ShippedActiveInput } from './stacks/types';
import { buildAssignmentRow, buildShippedHeaderQuickActions, deriveShippedHeaderMeta } from './details-panel/shipped-details-logic';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { toast } from '@/lib/toast';
import {
  useShippedAssignment,
  useShippedCopyActions,
  useShippedDeletion,
  useShippedDetailState,
  useShippedPanelViewState,
} from './details-panel/shipped-details-hooks';
import { ShippedDetailsHeader } from './details-panel/ShippedDetailsHeader';
import { ShippedDetailsBody } from './details-panel/ShippedDetailsBody';
import { ShippedPanelEditorDock } from './details-panel/ShippedPanelEditorDock';
import { OrderIdentityHeader } from '@/components/order-record/OrderIdentityHeader';
import { OrderRecordBody } from '@/components/order-record/OrderRecordBody';
import { getAccountSourceLabel } from '@/utils/order-links';
import { resolveOrderInspectorContext } from '@/lib/selection-context/order-inspector-context';

export type { ShippedActiveInput };

interface ShippedDetailsPanelProps {
  shipped: ShippedOrder;
  onClose: () => void;
  onUpdate: () => void;
  context?: 'dashboard' | 'queue' | 'fulfillment' | 'labels' | 'staged' | 'shipped' | 'station' | 'packer';
}

export function ShippedDetailsPanel({
  shipped: initialShipped,
  onClose,
  onUpdate,
  context = 'dashboard',
}: ShippedDetailsPanelProps) {
  const router = useRouter();
  /**
   * D2/D2a — the order-record surfaces render the shared single-scroll
   * `OrderRecordBody`; every other context keeps the legacy tabbed
   * `ShippedDetailsBody`. Station / packer / labels / staged / fulfillment are
   * a different job (several are Station-contract at `floor` density) and get a
   * variant designed on their own terms, not this retrofitted.
   */
  const isOrderRecord = context === 'dashboard';
  const isFulfillmentPanel = context === 'queue' || context === 'fulfillment';
  const isLabelsPanel = context === 'labels';
  // Dashboard-style contexts get the panel-action bar, the Customer tab, and the
  // shipping-label drop-zone (labels only).
  const showDashboardExtras = context === 'dashboard' || isFulfillmentPanel || isLabelsPanel;
  /**
   * Contextual SoT: which tab opens, whether Documents is a tab at all, whether
   * that tray manages or only previews, and which record-plane hand-offs exist.
   * Outbound documents (label + slip) get their own tab wherever the tray used
   * to render inline (docs/outbound-documents-plan.md §9.1/9.2) — full tray on
   * labels, read-only on dashboard/fulfillment/staged.
   */
  const inspectorContext = resolveOrderInspectorContext({ panelContext: context });
  const showDocumentsTab = inspectorContext.showDocumentsTab;

  const [durationData] = useState<DetailsStackDurationData>({});

  const {
    shipped,
    setShipped,
    orderNumber,
    setOrderNumber,
    itemNumber,
    setItemNumber,
    shippingTrackingNumber,
    setShippingTrackingNumber,
    notes,
    setNotes,
    isOutOfStock,
    shipByDate,
    setShipByDate,
    isSavingInlineFields,
    isSavingNotes,
    isSavingOutOfStock,
    isSavingShipByDate,
    saveInlineFields,
    saveShipByDate,
    handleSaveNotes,
    handleSaveOutOfStock,
  } = useShippedDetailState(initialShipped, onUpdate);

  const meta = deriveShippedHeaderMeta(shipped);
  const platformLabel = getAccountSourceLabel(shipped.order_id, shipped.account_source);

  const {
    activeSection,
    setActiveSection,
    activeInput,
    setActiveInput,
  } = useShippedPanelViewState({
    initialShipped,
    defaultSection: inspectorContext.defaultTab,
  });

  const { copiedAll, copiedOrderId, handleCopyAll, handleCopyOrderId } = useShippedCopyActions(
    shipped,
    meta.orderIdDisplay,
  );
  const { isDeleteArmed, isDeleting, handleDelete } = useShippedDeletion(shipped, onUpdate);
  const assignOrder = useOrderAssignment();
  const isUrgent = Boolean((shipped as { is_urgent?: unknown }).is_urgent);
  const {
    showAssignmentCard,
    setShowAssignmentCard,
    openAssignmentCard,
    handleAssignmentConfirm,
    technicianOptions,
    packerOptions,
  } = useShippedAssignment({ shipped, setShipped, onUpdate });

  // Goals / status / out-of-stock / notes actions, rendered in the header
  // action bar instead of inside each stack.
  const panelActions = usePanelActions(
    { entityType: 'order', entityId: shipped.id, orderId: shipped.order_id },
    {
      status: () => setActiveInput((prev) => (prev === 'mark_shipped' ? 'none' : 'mark_shipped')),
      out_of_stock: () => setActiveInput((prev) => (prev === 'out_of_stock' ? 'none' : 'out_of_stock')),
      notes: () => setActiveInput((prev) => (prev === 'notes' ? 'none' : 'notes')),
      urgent: () => {
        const id = Number(shipped.id);
        if (!Number.isFinite(id)) return;
        const next = !isUrgent;
        assignOrder.mutate(
          { orderId: id, isUrgent: next },
          {
            onSuccess: () => {
              setShipped((prev) => ({ ...prev, is_urgent: next }));
              toast.success(next ? 'Marked urgent' : 'Urgent cleared');
            },
            onError: (err) =>
              toast.error(err instanceof Error ? err.message : 'Failed to update urgent'),
          },
        );
      },
    },
  );

  // Compose the action list directly (assign + entity actions) for the flat,
  // full-width bar in PaneHeader.belowSlot — bypassing the rounded-card adapter.
  const mappedPanelActions: PaneHeaderActionBarAction[] = panelActions.map((action) => ({
    key: action.key,
    label: action.label,
    icon: <span className={action.toneClassName}>{action.icon}</span>,
    onClick: action.onAction,
    // Highlight the button while its panel is open, so the selected action is clear.
    active:
      action.key === 'urgent'
        ? isUrgent
        : action.key === 'status'
          ? activeInput === 'mark_shipped'
          : action.key === 'out_of_stock'
            ? activeInput === 'out_of_stock'
            : action.key === 'notes'
              ? activeInput === 'notes'
              : false,
    // The "Status" action opens the Mark-as-shipped form — name the tooltip for
    // what it does, not the generic catalog label.
    ...(action.key === 'status' ? { title: 'Mark as shipped' } : {}),
    ...(action.key === 'urgent' ? { title: isUrgent ? 'Clear urgent' : 'Mark urgent' } : {}),
  }));
  const headerBarActions: PaneHeaderActionBarAction[] = showDashboardExtras
    ? buildShippedHeaderQuickActions(
        mappedPanelActions.filter((action) => action.key !== 'goals'),
      )
    : [];

  const stackActionBar = {
    onClose,
    onMoveUp: () => dispatchNavigateShippedDetails('up'),
    onMoveDown: () => dispatchNavigateShippedDetails('down'),
    onAssign: meta.canEditAssignment ? openAssignmentCard : undefined,
  };

  return (
    // Non-modal inspector: picking a row and editing it is a pick+edit job, not a
    // blocking decision, so the queue underneath stays scrollable / clickable and
    // nothing dims. The scrim used to hide exactly the context the operator needs
    // (sibling rows, KPI strip, lifecycle tabs). Every other right-rail occupant
    // keeps the modal default.
    <DetailStackRailRegistrar
      // STABLE id — deliberately NOT keyed on the record. The host keys its
      // `AnimatePresence mode="wait"` on the occupant id, so a per-record id made
      // every row→row step a full exit-then-enter: ~0.4s out, ~0.4s in, with an
      // empty slot in between. Arrowing down a queue is the core loop here, and
      // a blank gap per step is the wrong cost. With one stable id the occupant
      // stays mounted and its node is swapped in place (the store's
      // `updateRightRailPanelNode` path, which exists for exactly this).
      //
      // Safe because the panel fully re-seeds on record change: every editable
      // field re-reads from the incoming record, the open tab resets, and any
      // dirty note is flushed for the outgoing order first (see
      // `useShippedDetailState`). Per-entity crossfade remains the default for
      // every OTHER occupant — this is a scoped exception, not a host change.
      id="detail:order"
      onClose={onClose}
      modal={false}
      ariaLabel={`Order ${meta.orderIdDisplay} details`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {isOrderRecord ? (
          <OrderIdentityHeader
            orderIdDisplay={meta.orderIdDisplay}
            showExceptionsFallback={meta.showExceptionsFallback}
            statusLabel={meta.statusLabel}
            statusTone={meta.statusTone}
            platformLabel={platformLabel}
            copiedOrderId={copiedOrderId}
            onCopyOrderId={handleCopyOrderId}
            actions={headerBarActions}
            onMoveUp={stackActionBar.onMoveUp}
            onMoveDown={stackActionBar.onMoveDown}
            onOpenFullPage={() => router.push(`/o/${shipped.id}`)}
            compact
          />
        ) : (
          <ShippedDetailsHeader
            orderIdDisplay={meta.orderIdDisplay}
            showExceptionsFallback={meta.showExceptionsFallback}
            copiedOrderId={copiedOrderId}
            onCopyOrderId={handleCopyOrderId}
            onClose={onClose}
            actions={headerBarActions}
            onMoveUp={stackActionBar.onMoveUp}
            onMoveDown={stackActionBar.onMoveDown}
            showCustomerTab={false}
            showWarrantyTab={false}
            showDocumentsTab={showDocumentsTab}
            showTabs
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            onOpenFullPage={() => router.push(`/o/${shipped.id}`)}
          />
        )}

        {isOrderRecord ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-4 py-4">
                <OrderRecordBody
                  order={shipped}
                  density="compact"
                  documentsReadOnly
                  copiedAll={copiedAll}
                  onCopyAll={handleCopyAll}
                  onUpdate={onUpdate}
                  onAssign={meta.canEditAssignment ? openAssignmentCard : undefined}
                  editableShippingFields={{
                    orderNumber,
                    itemNumber,
                    trackingNumber: shippingTrackingNumber,
                    shipByDate,
                    isSaving: isSavingInlineFields,
                    isSavingShipByDate,
                    onOrderNumberChange: setOrderNumber,
                    onItemNumberChange: setItemNumber,
                    onTrackingNumberChange: setShippingTrackingNumber,
                    onShipByDateChange: setShipByDate,
                    onBlur: () => { void saveInlineFields(); },
                    onShipByDateBlur: () => { void saveShipByDate(shipByDate); },
                  }}
                />
              </div>
            </div>

            <ShippedPanelEditorDock
              shipped={shipped}
              activeInput={activeInput}
              setActiveInput={setActiveInput}
              showMarkAsShipped
              showOutOfStock
              showNotes
              notes={notes}
              setNotes={setNotes}
              isSavingNotes={isSavingNotes}
              onSaveNotes={() => { void handleSaveNotes(() => setActiveInput('none')); }}
              isOutOfStock={isOutOfStock}
              isSavingOutOfStock={isSavingOutOfStock}
              onSaveOutOfStock={(checked) => {
                void handleSaveOutOfStock(checked, () => setActiveInput('none'));
              }}
              shippingTrackingNumber={shippingTrackingNumber}
              onMarkShippedSuccess={() => {
                setActiveInput('none');
                onUpdate();
              }}
            />
          </>
        ) : (
        <ShippedDetailsBody
          context={context}
          isFulfillmentPanel={isFulfillmentPanel}
          isLabelsPanel={isLabelsPanel}
          documentsMode={inspectorContext.documentsMode}
          recordCtas={inspectorContext.recordCtas}
          showDashboardExtras={showDashboardExtras}
          showQuickLinks
          activeSection={activeSection}
          shipped={shipped}
          durationData={durationData}
          copiedAll={copiedAll}
          onCopyAll={handleCopyAll}
          onUpdate={onUpdate}
          activeInput={activeInput}
          setActiveInput={setActiveInput}
          stackActionBar={stackActionBar}
          editableFields={{
            orderNumber,
            itemNumber,
            trackingNumber: shippingTrackingNumber,
            shipByDate,
            isSavingInlineFields,
            isSavingShipByDate,
            setOrderNumber,
            setItemNumber,
            setTrackingNumber: setShippingTrackingNumber,
            setShipByDate,
            onSaveInline: saveInlineFields,
            onSaveShipByDate: saveShipByDate,
          }}
          notes={notes}
          setNotes={setNotes}
          isSavingNotes={isSavingNotes}
          onSaveNotes={() => { void handleSaveNotes(() => setActiveInput('none')); }}
          isOutOfStock={isOutOfStock}
          isSavingOutOfStock={isSavingOutOfStock}
          onSaveOutOfStock={(checked) => {
            void handleSaveOutOfStock(checked, () => setActiveInput('none'));
          }}
          onMarkShippedSuccess={() => {
            setActiveInput('none');
            onUpdate();
          }}
          isDeleteArmed={isDeleteArmed}
          isDeletingOrder={isDeleting}
          onDeleteOrder={handleDelete}
        />
        )}

        <AnimatePresence>
          {showAssignmentCard && meta.canEditAssignment ? (
            <WorkOrderAssignmentCard
              rows={[buildAssignmentRow(shipped)]}
              startIndex={0}
              technicianOptions={technicianOptions}
              packerOptions={packerOptions}
              onConfirm={handleAssignmentConfirm}
              onClose={() => setShowAssignmentCard(false)}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </DetailStackRailRegistrar>
  );
}
