'use client';

/**
 * OrderFullPageView — dedicated `/o/[orderId]` order workspace detail pane.
 *
 * Two layouts share one detail SoT (`ShippedDetailsHeader` + `ShippedDetailsBody`):
 *   • `workbench` — sidebar owns navigation; no back/close chrome
 *   • `standalone` — same tabbed body (deep links / QR / embedded search);
 *     no browser-history back button
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
import type { DetailsStackDurationData } from '@/components/shipped/stacks/types';
import { buildAssignmentRow, buildShippedHeaderQuickActions, deriveShippedHeaderMeta } from '@/components/shipped/details-panel/shipped-details-logic';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { toast } from '@/lib/toast';
import {
  useShippedAssignment,
  useShippedCopyActions,
  useShippedDeletion,
  useShippedDetailState,
  useShippedPanelViewState,
} from '@/components/shipped/details-panel/shipped-details-hooks';
import { ShippedDetailsHeader } from '@/components/shipped/details-panel/ShippedDetailsHeader';
import { ShippedDetailsBody } from '@/components/shipped/details-panel/ShippedDetailsBody';
import { orderSearchHref } from '@/lib/search/search-hit';
import {
  resolveSearchOrder,
  type ResolvedSearchOrder,
} from '@/lib/search/resolve-search-order';

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
  const searchParams = useSearchParams();
  const [resolved, setResolved] = useState<Resolved | null>(null);

  // Legacy search handoff: `/o/[id]?mode=search` → Dashboard Search detail.
  useEffect(() => {
    if (searchParams.get('mode') !== 'search') return;
    const q = searchParams.get('q') ?? undefined;
    router.replace(orderSearchHref(orderId, q ?? undefined));
  }, [searchParams, orderId, router]);

  const load = useCallback(async () => {
    setResolved(await resolveSearchOrder(orderId));
  }, [orderId]);

  useEffect(() => {
    if (searchParams.get('mode') === 'search') return;
    void load();
  }, [load, searchParams]);

  if (searchParams.get('mode') === 'search') {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas">
        <span className="flex items-center gap-2 text-role-caption font-semibold text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening search detail…
        </span>
      </div>
    );
  }

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
  const [durationData] = useState<DetailsStackDurationData>({});
  // layout reserved for future chrome differences (workbench vs deep-link);
  // both share the tabbed header/body today.
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
    outOfStock,
    setOutOfStock,
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
  const { activeSection, setActiveSection, activeInput, setActiveInput } = useShippedPanelViewState({
    initialShipped: order,
    journeyFirst,
  });
  const { copiedAll, copiedOrderId, handleCopyAll, handleCopyOrderId } = useShippedCopyActions(
    shipped,
    meta.orderIdDisplay,
  );
  const { isDeleteArmed, isDeleting, handleDelete } = useShippedDeletion(shipped, onReload);
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
      <ShippedDetailsHeader
        orderIdDisplay={meta.orderIdDisplay}
        showExceptionsFallback={meta.showExceptionsFallback}
        copiedOrderId={copiedOrderId}
        onCopyOrderId={handleCopyOrderId}
        actions={headerBarActions}
        showCustomerTab
        showDocumentsTab
        showWarrantyTab
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <div className="shrink-0 border-b border-border-hairline px-6 py-3">
        <PackoutChecklistCard
          orderRowId={shipped.id ? Number(shipped.id) : null}
          sku={shipped.sku}
          condition={shipped.condition}
          productTitle={shipped.product_title}
        />
      </div>

      <ShippedDetailsBody
        context="dashboard"
        isFulfillmentPanel={false}
        isLabelsPanel={false}
        showDashboardExtras
        activeSection={activeSection}
        shipped={shipped}
        durationData={durationData}
        copiedAll={copiedAll}
        onCopyAll={handleCopyAll}
        onUpdate={onReload}
        activeInput={activeInput}
        setActiveInput={setActiveInput}
        stackActionBar={{
          onClose: () => undefined,
          onMoveUp: () => undefined,
          onMoveDown: () => undefined,
          onAssign: meta.canEditAssignment ? openAssignmentCard : undefined,
        }}
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
        onSaveNotes={() => {
          void handleSaveNotes(() => setActiveInput('none'));
        }}
        outOfStock={outOfStock}
        setOutOfStock={setOutOfStock}
        isSavingOutOfStock={isSavingOutOfStock}
        onSaveOutOfStock={() => {
          void handleSaveOutOfStock(() => setActiveInput('none'));
        }}
        onMarkShippedSuccess={() => {
          setActiveInput('none');
          onReload();
        }}
        isDeleteArmed={isDeleteArmed}
        isDeletingOrder={isDeleting}
        onDeleteOrder={handleDelete}
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
