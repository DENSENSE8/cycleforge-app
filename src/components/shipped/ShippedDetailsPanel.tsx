'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from '@/design-system/motion';
import { ShippedOrder } from '@/lib/neon/orders-queries';
import { dispatchNavigateShippedDetails } from '@/utils/events';
import { useRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { usePanelActions } from '@/hooks/usePanelActions';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { useRailHeaderActions } from '@/components/dashboard/rail/OrderRailActions';

import { WorkOrderAssignmentCard } from '@/components/work-orders/WorkOrderAssignmentCard';
import { type PaneHeaderActionBarAction } from '@/components/ui/pane-header';
import type {
  DetailsStackDurationData,
  ShippedActiveInput,
  ShippedActiveSection,
} from './stacks/types';
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
import { PaneHeaderTabs } from '@/components/ui/pane-header';
import { ShippedDetailsBody } from './details-panel/ShippedDetailsBody';
import { ShippedPanelEditorDock } from './details-panel/ShippedPanelEditorDock';
import { RecordPaneHeader } from '@/components/order-record/RecordPaneHeader';
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
  /**
   * Contextual SoT: which tab opens, whether Documents is a tab at all, whether
   * that tray manages or only previews, which record-plane hand-offs exist, and
   * whether this lane may dispatch / delete / mount the editor dock.
   * Outbound documents (label + slip) get their own tab wherever the tray used
   * to render inline (docs/outbound-documents-plan.md §9.1/9.2) — full tray on
   * labels, read-only on dashboard/fulfillment/staged.
   */
  const inspectorContext = resolveOrderInspectorContext({ panelContext: context });
  const showDocumentsTab = inspectorContext.showDocumentsTab;
  // Dashboard-style contexts get the panel-action bar + the shipping-label
  // drop-zone (labels only) — the same lanes the descriptor calls "dispatch".
  const showDashboardExtras = inspectorContext.showDispatchExtras;

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
    isOutOfStock,
    shipByDate,
    setShipByDate,
    isSavingInlineFields,
    isSavingOutOfStock,
    isSavingShipByDate,
    saveInlineFields,
    saveShipByDate,
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
  // Selection actions live in the SAME header icon bar as the panel's own
  // actions — never a second labelled block at the foot of the panel. See
  // `useRailHeaderActions`.
  const railHeaderActions = useRailHeaderActions();
  const headerBarActions: PaneHeaderActionBarAction[] = showDashboardExtras
    ? [
        ...buildShippedHeaderQuickActions(
          mappedPanelActions.filter((action) => action.key !== 'goals'),
        ),
        ...railHeaderActions,
      ]
    : railHeaderActions;

  /**
   * Where this record sits in the collection behind it, and what ↑ / ↓ open.
   *
   * This panel used to dispatch `navigate-shipped-details` and hope something
   * was listening. Three listeners were, over three different row shapes, each
   * with its own copy of `findIndex → ±1 → open` — and on the Shipped lane two
   * of them ran on the same keypress, so one press stepped twice. Now the
   * collection publishes its order once and this reads it
   * (`record-cursor-unification-PLAN.md` §1.1–1.2, §3.5).
   *
   * **The legacy dispatch stays as the fallback, deliberately.** This one
   * component has six mount sites and only the dashboard lanes publish a cursor
   * in Phase 1; the Tech / Packer station tables still listen on the event via
   * `useStationDetailsSelection`. Reading the cursor unconditionally would make
   * their chevrons dead-but-enabled — §2.1's exact defect, moved onto two more
   * surfaces. `cursor.available` is the discriminator, and the fallback is
   * deleted in Phase 3 together with the event.
   */
  const cursor = useRecordCursor('record');

  const handleMoveUp = useCallback(() => {
    if (cursor.available) {
      cursor.onPrev?.();
      return;
    }
    dispatchNavigateShippedDetails('up');
  }, [cursor]);

  const handleMoveDown = useCallback(() => {
    if (cursor.available) {
      cursor.onNext?.();
      return;
    }
    dispatchNavigateShippedDetails('down');
  }, [cursor]);

  // Ends-of-list state and the `n / m` readout only exist when a cursor is
  // published. Left undefined otherwise, so a non-publishing surface keeps its
  // always-enabled chevrons and renders no readout at all (honest absence)
  // rather than a "1 / 1" that claims a queue it does not have.
  const cursorPosition = cursor.available ? cursor.position : null;
  const cursorTotal = cursor.available ? cursor.total : undefined;
  const cursorPrevDisabled = cursor.available ? cursor.prevDisabled : undefined;
  const cursorNextDisabled = cursor.available ? cursor.nextDisabled : undefined;

  const stackActionBar = {
    onClose,
    onMoveUp: handleMoveUp,
    onMoveDown: handleMoveDown,
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
        {/* ONE header for both branches (was `OrderIdentityHeader` vs
            `ShippedDetailsHeader`, picked on `isOrderRecord`). The branch now
            decides only whether a tab strip follows — which is a slot, not a
            second component. Note the context trap: the dashboard's Pending /
            Tested lanes arrive with context `'fulfillment'`, so `isOrderRecord`
            is FALSE there and this is the branch they render. */}
        <RecordPaneHeader
          orderIdDisplay={meta.orderIdDisplay}
          showExceptionsFallback={meta.showExceptionsFallback}
          copiedOrderId={copiedOrderId}
          onCopyOrderId={handleCopyOrderId}
          actions={headerBarActions}
          onMoveUp={stackActionBar.onMoveUp}
          onMoveDown={stackActionBar.onMoveDown}
          prevDisabled={cursorPrevDisabled}
          nextDisabled={cursorNextDisabled}
          position={cursorPosition}
          total={cursorTotal}
          onOpenFullPage={() => router.push(`/o/${shipped.id}`)}
          onClose={onClose}
          compact={isOrderRecord}
          {...(isOrderRecord
            ? {
                statusLabel: meta.statusLabel,
                statusTone: meta.statusTone,
                platformLabel,
              }
            : null)}
          {...(isOrderRecord
            ? null
            : {
                tabs: (
                  <PaneHeaderTabs<ShippedActiveSection>
                    dense
                    tabs={[
                      { value: 'shipping' as const, label: 'Shipping' },
                      { value: 'product' as const, label: 'Product' },
                      ...(showDocumentsTab
                        ? [{ value: 'documents' as const, label: 'Documents' }]
                        : []),
                      { value: 'timeline' as const, label: 'Timeline' },
                      { value: 'conversation' as const, label: 'Conversation' },
                    ]}
                    value={activeSection}
                    onChange={setActiveSection}
                    className="px-5"
                  />
                ),
              })}
        />

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
              // No note composer in this panel (handoff §3.2) — note-writing
              // lives on `/o/[orderId]`, via the header's open-full-page
              // action. The other branch is off in `ShippedDetailsBody`.
              showNotes={false}
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
          inspectorContext={inspectorContext}
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

        {/* No action region at the foot of this panel. The 1-row selection's
            actions render as ICONS in the pane header's action bar
            (`useRailHeaderActions` → `headerBarActions`), because a second
            full-width block of labelled buttons down here duplicated the header
            bar — and duplicated real controls, not just chrome: this panel
            already owns a Delete, so the footer's Delete put two red buttons on
            one record. One action surface per panel.
            The header actions self-gate on the rail-actions store, so every
            panel context is safe: only a publishing surface
            (`useOrderRailSelection` on `/dashboard`) lights them up. */}

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
