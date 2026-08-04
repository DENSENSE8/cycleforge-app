'use client';

/**
 * Support-context order focus on the shared To-ship desk (`/shipping/orders`).
 *
 * Extracted from the former `/support?mode=orders` mount so Support › Inquiries
 * can alias the Fulfillment desk without a second orders board.
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  MessageSquare,
  Package,
  Ticket,
} from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState, IconButton, Spinner } from '@/design-system/primitives';
import { SectionTabsSlider } from '@/design-system/components';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

import {
  buildSectionTabs,
  StationWorkbench,
} from '@/components/station/workbench';
import {
  StationContextBar,
  StationMoreDetails,
} from '@/components/station/entity-context';
import { SupportContextHub } from '@/components/support/context';
import { ShippedDetailsPanelContent } from '@/components/shipped/ShippedDetailsPanelContent';
import { ShippedPanelEditorDock } from '@/components/shipped/details-panel/ShippedPanelEditorDock';
import {
  useShippedCopyActions,
  useShippedDetailState,
} from '@/components/shipped/details-panel/shipped-details-hooks';
import { deriveShippedHeaderMeta } from '@/components/shipped/details-panel/shipped-details-logic';
import type { ShippedActiveInput } from '@/components/shipped/stacks/types';
import { PaneHeaderCloseButton } from '@/components/ui/pane-header';
import { SHIPPING_ORDERS_PATH, shippingOrdersHref } from '@/lib/shipping/orders-desk';
import { SupportOrderIdentity } from './SupportOrderIdentity';
import { useSupportTicketClaimHost } from '@/components/support/service-workspace/useSupportTicketClaimHost';
import { SupportCreateTicketModal } from '@/components/support/service-workspace/SupportCreateTicketModal';
import {
  useInvalidateSupportOrderCaches,
  useSupportOrderDetail,
} from './useSupportOrderDetail';
import type { ShippedOrder } from '@/types/orders';

type OrdersView = 'order' | 'ticket' | 'support';

function SupportOrderFocus({
  order,
  onReload,
  onClose,
}: {
  order: ShippedOrder;
  onReload: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { has, isLoaded } = useAuth();
  const canCreateTicket = !isLoaded || has('integrations.zendesk');
  const claim = useSupportTicketClaimHost();
  const openCreateTicket = claim.openCreate;
  const { presence: paneMotion, transition: paneTransition } = useMotionRole(motionRole.swap.focus);
  const [view, setView] = useState<OrdersView>('order');
  const [activeInput, setActiveInput] = useState<ShippedActiveInput>('none');

  const {
    shipped,
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
  } = useShippedDetailState(order, onReload);

  // Deep link: ?createTicket=1 opens New ticket (order-anchored), then strips the flag.
  useEffect(() => {
    if (!canCreateTicket) return;
    const raw = searchParams.get('createTicket');
    if (raw !== '1' && raw !== 'true') return;
    openCreateTicket({ type: 'order', orderId: Number(shipped.id) });
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('createTicket');
    const qs = sp.toString();
    const base = pathname || SHIPPING_ORDERS_PATH;
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [canCreateTicket, openCreateTicket, pathname, router, searchParams, shipped.id]);

  const meta = deriveShippedHeaderMeta(shipped);
  const { copiedAll, handleCopyAll } = useShippedCopyActions(shipped, meta.orderIdDisplay);

  const orderAnchor = useMemo(
    () => ({
      order: String(shipped.order_id || shipped.id || '').trim() || undefined,
      tracking: String(shipped.shipping_tracking_number || '').trim() || undefined,
    }),
    [shipped.id, shipped.order_id, shipped.shipping_tracking_number],
  );

  const tabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'order',
          label: 'Order',
          icon: Package,
          content: (
            <div className="space-y-3 pb-4">
              <ShippedDetailsPanelContent
                shipped={shipped}
                durationData={{}}
                copiedAll={copiedAll}
                onCopyAll={handleCopyAll}
                onUpdate={onReload}
                showPackingPhotos
                showSerialNumber
                onReportIssue={
                  canCreateTicket
                    ? () => openCreateTicket({ type: 'order', orderId: Number(shipped.id) })
                    : undefined
                }
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
                  onBlur: () => {
                    void saveInlineFields();
                  },
                  onShipByDateBlur: () => {
                    void saveShipByDate(shipByDate);
                  },
                }}
              />
            </div>
          ),
        },
        {
          id: 'ticket',
          label: 'Ticket',
          icon: Ticket,
          content: (
            <div className="space-y-3 pb-4">
              <SupportContextHub
                anchor={orderAnchor}
                variant="station"
                onlySegment="customer"
                hideLinkage={false}
              />
            </div>
          ),
        },
        {
          id: 'support',
          label: 'Support',
          icon: MessageSquare,
          content: (
            <div className="space-y-3 pb-4">
              <SupportContextHub
                anchor={orderAnchor}
                variant="station"
                defaultSegment="team"
                hideCustomerSegment
                hideLinkage={false}
              />
            </div>
          ),
        },
      ]),
    [
      shipped,
      copiedAll,
      handleCopyAll,
      onReload,
      orderNumber,
      itemNumber,
      shippingTrackingNumber,
      shipByDate,
      isSavingInlineFields,
      isSavingShipByDate,
      setOrderNumber,
      setItemNumber,
      setShippingTrackingNumber,
      setShipByDate,
      saveInlineFields,
      saveShipByDate,
      orderAnchor,
      canCreateTicket,
      openCreateTicket,
    ],
  );

  const activeView: OrdersView = tabs.some((t) => t.id === view) ? view : 'order';

  return (
    <motion.div
      key={shipped.id}
      className="relative flex h-full min-h-0 w-full flex-col bg-surface-canvas"
      initial={paneMotion.initial}
      animate={paneMotion.animate}
      exit={paneMotion.exit}
      transition={paneTransition}
    >
      <StationContextBar
        identity={<SupportOrderIdentity order={shipped} />}
        moreDetails={
          <StationMoreDetails>
            <HoverTooltip label="Notes">
              <IconButton
                size="sm"
                icon={<FileText className="h-3.5 w-3.5" />}
                ariaLabel="Edit notes"
                aria-pressed={activeInput === 'notes'}
                onClick={() =>
                  setActiveInput((prev) => (prev === 'notes' ? 'none' : 'notes'))
                }
                className={
                  activeInput === 'notes' ? 'rounded-md bg-surface-sunken text-text-default' : undefined
                }
              />
            </HoverTooltip>
            <HoverTooltip label="Out of stock">
              <IconButton
                size="sm"
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                ariaLabel="Toggle out of stock"
                aria-pressed={activeInput === 'out_of_stock'}
                onClick={() =>
                  setActiveInput((prev) =>
                    prev === 'out_of_stock' ? 'none' : 'out_of_stock',
                  )
                }
                className={
                  activeInput === 'out_of_stock'
                    ? 'rounded-md bg-surface-sunken text-text-default'
                    : undefined
                }
              />
            </HoverTooltip>
            <HoverTooltip label="Open on To ship">
              <IconButton
                size="sm"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                ariaLabel="Open on To ship"
                onClick={() =>
                  router.push(shippingOrdersHref({ openOrderId: Number(shipped.id) }))
                }
              />
            </HoverTooltip>
            <PaneHeaderCloseButton
              onClick={onClose}
              ariaLabel="Back to orders queue"
              title="Back to orders queue"
            />
          </StationMoreDetails>
        }
      />

      <StationWorkbench
        className="min-h-0 flex-1"
        reserveScrollClearance={false}
        reserveIdentityClearance="stacked"
        scrollClassName="pb-28"
        tabs={
          <SectionTabsSlider
            tabs={tabs}
            value={activeView}
            onChange={(id) => setView(id as OrdersView)}
            ariaLabel="Order displays"
          />
        }
        footer={
          <ShippedPanelEditorDock
            shipped={shipped}
            activeInput={activeInput}
            setActiveInput={setActiveInput}
            showMarkAsShipped={false}
            showOutOfStock
            showNotes
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
        }
      />

      <SupportCreateTicketModal
        open={claim.createOpen}
        defaultSubject={`Order #${meta.orderIdDisplay}`}
        defaultOrderNumber={meta.orderIdDisplay}
        orderFieldLocked
        submitting={claim.createTicket.isPending}
        onClose={claim.closeCreate}
        onCreate={({ subject, note, linkages }) =>
          claim.createTicket.mutate(
            { subject, note, linkages },
            {
              onSuccess: (data) =>
                router.push(`/support?ticket=${data.providerTicketId}`),
            },
          )
        }
      />
    </motion.div>
  );
}

export function SupportOrdersFocusHost({ openOrderId }: { openOrderId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidate = useInvalidateSupportOrderCaches();
  const { data: order, isLoading, isError, refetch } = useSupportOrderDetail(openOrderId);

  const clearOpenOrder = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete('openOrderId');
    sp.delete('createTicket');
    sp.set('context', 'support');
    const qs = sp.toString();
    router.replace(qs ? `${SHIPPING_ORDERS_PATH}?${qs}` : shippingOrdersHref({ context: 'support' }), {
      scroll: false,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-role-caption font-semibold text-text-muted">
        <Spinner className="h-4 w-4" /> Loading order…
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-center p-6">
          <EmptyState
            title="Order not found"
            description="It may have shipped or you lack access. Try Shipping · To ship."
          />
        </div>
        <div className="flex justify-center pb-8">
          <IconButton
            size="md"
            icon={<Package className="h-4 w-4" />}
            ariaLabel="Back to orders queue"
            onClick={clearOpenOrder}
          />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <SupportOrderFocus
        key={order.id}
        order={order}
        onClose={clearOpenOrder}
        onReload={() => {
          invalidate(Number(order.id));
          void refetch();
        }}
      />
    </AnimatePresence>
  );
}
