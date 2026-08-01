'use client';

/**
 * OrderFullPageView — `/o/[orderId]`, the canonical order record (Week 1, D1).
 *
 * Chrome is `OrderIdentityHeader` (order # + status + platform + actions) over
 * the concise `OrderRecordBody` — one vertical scroll, main column + right rail —
 * with the editor dock, delete, and assignment card unchanged.
 *
 * Two layouts share it:
 *   • `workbench` — sidebar owns navigation; no back/close chrome
 *   • `standalone` — same body (deep links / QR); no browser-history back button
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { ExternalLink, Package, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import type { ShippedOrder } from '@/types/orders';
import { PackoutChecklistCard } from '@/components/shipped/PackoutChecklistCard';
import { WorkOrderAssignmentCard } from '@/components/work-orders/WorkOrderAssignmentCard';
import { usePanelActions } from '@/hooks/usePanelActions';
import { type PaneHeaderActionBarAction } from '@/components/ui/pane-header';
import { buildAssignmentRow, buildShippedHeaderQuickActions, deriveShippedHeaderMeta } from '@/components/shipped/details-panel/shipped-details-logic';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { toast } from '@/lib/toast';
import {
  useShippedAssignment,
  useShippedCopyActions,
  useShippedDetailState,
  useShippedPanelViewState,
} from '@/components/shipped/details-panel/shipped-details-hooks';
import { ShippedPanelEditorDock } from '@/components/shipped/details-panel/ShippedPanelEditorDock';
import { DeleteOrderControl } from '@/components/shipped/stacks/DeleteOrderControl';
import { OrderIdentityHeader } from '@/components/order-record/OrderIdentityHeader';
import { OrderRecordBody } from '@/components/order-record/OrderRecordBody';
import { resolveOrderInspectorContext } from '@/lib/selection-context/order-inspector-context';
import {
  resolveSearchOrder,
  type ResolvedSearchOrder,
} from '@/lib/search/resolve-search-order';
import { getAccountSourceLabel } from '@/utils/order-links';

export type OrderFullPageLayout = 'standalone' | 'workbench';

/** Resolution outcome for a /o/[orderId] param. */
type Resolved = ResolvedSearchOrder;

function EmptyStateShell({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-canvas">
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm rounded-xl border border-dashed border-border-soft bg-surface-canvas px-6 py-10 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-text-faint" />
          <p className="text-role-caption font-semibold text-text-default">{title}</p>
          <p className="mt-1 text-role-caption text-text-muted">{body}</p>
          {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function OrderFullPageView({
  orderId,
  layout = 'standalone',
}: {
  orderId: string;
  layout?: OrderFullPageLayout;
}) {
  const router = useRouter();
  const [resolved, setResolved] = useState<Resolved | null>(null);

  // NOTE (Week 1, D1): `/o/[orderId]` is the canonical order record. It used to
  // bounce `?mode=search` traffic back to `/dashboard?mode=search` — which made
  // the most complete surface unreachable from search. That redirect is gone;
  // `?mode=search` now only hints which section opens first (see journeyFirst).

  const load = useCallback(async () => {
    setResolved(await resolveSearchOrder(orderId));
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (resolved === null) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas">
        <span className="flex items-center gap-2 text-role-caption font-semibold text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading order…
        </span>
      </div>
    );
  }

  if (resolved.status === 'fba') {
    return (
      <EmptyStateShell
        title="This is an Amazon FBA shipment"
        body="FBA shipments are managed in the FBA workspace, not the order page."
        action={
          <Button
            variant="primary"
            size="md"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => router.push('/fba')}
          >
            Open FBA workspace
          </Button>
        }
      />
    );
  }

  if (resolved.status === 'notfound') {
    return (
      <EmptyStateShell
        title="Order not found"
        body={
          <>
            Couldn&apos;t load <span className="font-mono">{orderId}</span>.
          </>
        }
      />
    );
  }

  return (
    <OrderFullPageLoaded
      order={resolved.order}
      onReload={() => void load()}
      layout={layout}
    />
  );
}

function OrderFullPageLoaded({
  order,
  onReload,
  layout,
}: {
  order: ShippedOrder;
  onReload: () => void;
  layout: OrderFullPageLayout;
}) {
  const searchParams = useSearchParams();
  // layout reserved for future chrome differences (workbench vs deep-link);
  // both share the same header + single-scroll record body today.
  void layout;

  // Header search deep-links land with `?mode=search` — open Timeline / Item Journey first.
  const journeyFirst = searchParams.get('mode') === 'search';

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
  } = useShippedDetailState(order, onReload);

  const meta = deriveShippedHeaderMeta(shipped);
  const platformLabel = getAccountSourceLabel(shipped.order_id, shipped.account_source);
  const { activeInput, setActiveInput } = useShippedPanelViewState({
    initialShipped: order,
    // Single-scroll record body — no tab strip here, so the opening section only
    // matters for parity with the slide-over. Resolved from the same SoT so the
    // journey-first hint can never mean two different things.
    defaultSection: resolveOrderInspectorContext({ panelContext: 'dashboard', journeyFirst })
      .defaultTab,
  });
  const { copiedAll, copiedOrderId, handleCopyAll, handleCopyOrderId } = useShippedCopyActions(
    shipped,
    meta.orderIdDisplay,
  );
  // Delete on this surface runs through `DeleteOrderControl` (the dashboard-context
  // path the tabbed body also used here); `useShippedDeletion` served the
  // `context="shipped"` button, which this record page never rendered.
  const assignOrder = useOrderAssignment();
  const isUrgent = Boolean((shipped as { is_urgent?: unknown }).is_urgent);
  const {
    showAssignmentCard,
    setShowAssignmentCard,
    openAssignmentCard,
    handleAssignmentConfirm,
    technicianOptions,
    packerOptions,
  } = useShippedAssignment({ shipped, setShipped, onUpdate: onReload });

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

  const mappedPanelActions: PaneHeaderActionBarAction[] = panelActions.map((action) => ({
    key: action.key,
    label: action.label,
    icon: <span className={action.toneClassName}>{action.icon}</span>,
    onClick: action.onAction,
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
    ...(action.key === 'status' ? { title: 'Mark as shipped' } : {}),
    ...(action.key === 'urgent' ? { title: isUrgent ? 'Clear urgent' : 'Mark urgent' } : {}),
  }));
  const headerBarActions: PaneHeaderActionBarAction[] = buildShippedHeaderQuickActions(
    mappedPanelActions.filter((action) => action.key !== 'goals'),
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      <OrderIdentityHeader
        orderIdDisplay={meta.orderIdDisplay}
        showExceptionsFallback={meta.showExceptionsFallback}
        statusLabel={meta.statusLabel}
        statusTone={meta.statusTone}
        platformLabel={platformLabel}
        copiedOrderId={copiedOrderId}
        onCopyOrderId={handleCopyOrderId}
        actions={headerBarActions}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-5">
          <div className="mb-4">
            <PackoutChecklistCard
              orderRowId={shipped.id ? Number(shipped.id) : null}
              sku={shipped.sku}
              condition={shipped.condition}
              productTitle={shipped.product_title}
            />
          </div>

          <OrderRecordBody
            order={shipped}
            density="full"
            documentsReadOnly
            copiedAll={copiedAll}
            onCopyAll={handleCopyAll}
            onUpdate={onReload}
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

          <section className="pt-4">
            <DeleteOrderControl
              orderId={shipped.id}
              packerLogId={(shipped as { packer_log_id?: number }).packer_log_id ?? null}
              stationActivityLogId={
                (shipped as { station_activity_log_id?: number }).station_activity_log_id
                ?? (shipped as { sal_id?: number }).sal_id
                ?? null
              }
              trackingType={shipped.tracking_type}
              onDeleted={onReload}
            />
          </section>
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
        onSaveNotes={() => {
          void handleSaveNotes(() => setActiveInput('none'));
        }}
        isOutOfStock={isOutOfStock}
        isSavingOutOfStock={isSavingOutOfStock}
        onSaveOutOfStock={(checked) => {
          void handleSaveOutOfStock(checked, () => setActiveInput('none'));
        }}
        shippingTrackingNumber={shippingTrackingNumber}
        onMarkShippedSuccess={() => {
          setActiveInput('none');
          onReload();
        }}
      />

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
  );
}
