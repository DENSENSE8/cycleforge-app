'use client';

/**
 * Support-context order focus on the shared To-ship desk (`/shipping/orders`).
 *
 * Extracted from the former `/support?mode=orders` mount so Support › Inquiries
 * can alias the Fulfillment desk without a second orders board.
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from '@/design-system/motion';
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
import { HoverTooltip } from '@/components/ui/HoverTooltip';

import { buildSectionTabs } from '@/components/station/workbench';
import { StationMoreDetails } from '@/components/station/entity-context';
import { STATION_DISPLAY_INDEX } from '@/components/station/displays';
import { OrderStationIdentity } from '@/components/station/order';
import { EntityStationPane } from '@/components/station/entity';
import { buildSupportOrdersDisplayIndexRows } from '@/components/support/orders/support-orders-display-index';
import { SupportContextHub } from '@/components/support/context';
import { ShippedDetailsPanelContent } from '@/components/shipped/ShippedDetailsPanelContent';
import { ShippedPanelEditorDock } from '@/components/shipped/details-panel/ShippedPanelEditorDock';
import {
  useShippedDetailState,
} from '@/components/shipped/details-panel/shipped-details-hooks';
import { deriveShippedHeaderMeta } from '@/components/shipped/details-panel/shipped-details-logic';
import type { ShippedActiveInput } from '@/components/shipped/stacks/types';
import { SHIPPING_ORDERS_PATH, shippingOrdersHref } from '@/lib/shipping/orders-desk';
import { useSupportTicketClaimHost } from '@/components/support/service-workspace/useSupportTicketClaimHost';
import { SupportCreateTicketModal } from '@/components/support/service-workspace/SupportCreateTicketModal';
import {
  useInvalidateSupportOrderCaches,
  useSupportOrderDetail,
} from './useSupportOrderDetail';
import type { ShippedOrder } from '@/types/orders';

/**
 * Reference-tool leaves live on the right-edge Displays push, never a centre
 * `SectionTabsSlider` — `.claude/rules/display/station-workbench.md` Hard
 * Nevers. Centre stays Order only (ops-flow: the order's own editable
 * fields); Ticket / Support are Unbox-style leaves.
 */
type SupportOrdersDisplayTab = 'ticket' | 'support';
/** Displays nav: closed is `null`; open is the Root Index or a content leaf. */
type SupportOrdersDisplayNav = typeof STATION_DISPLAY_INDEX | SupportOrdersDisplayTab;

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
  const [activeSideTab, setActiveSideTab] = useState<SupportOrdersDisplayNav | null>(null);
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

  const orderAnchor = useMemo(
    () => ({
      order: String(shipped.order_id || shipped.id || '').trim() || undefined,
      tracking: String(shipped.shipping_tracking_number || '').trim() || undefined,
    }),
    [shipped.id, shipped.order_id, shipped.shipping_tracking_number],
  );

  /** Centre stays ops-flow only — the order's own editable fields, never a tab strip. */
  const orderContent = useMemo(
    () => (
      <div className="space-y-3 pb-4">
        <ShippedDetailsPanelContent
          canEditProduct
          shipped={shipped}
          durationData={{}}
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
    [
      shipped,
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
      canCreateTicket,
      openCreateTicket,
    ],
  );

  /**
   * Reference-tool leaves — the Displays Root Index catalog for this order.
   * Ticket / Support used to be centre tabs; that put reference content in
   * the ops-flow slot the Unbox SoT reserves for the order's own work.
   */
  const displayIndexRows = useMemo(
    () =>
      buildSupportOrdersDisplayIndexRows({
        hasTicketHint: Boolean(String(meta.orderIdDisplay ?? '').trim()),
      }),
    [meta.orderIdDisplay],
  );

  const displayTabs = useMemo(
    () =>
      buildSectionTabs([
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
                // No peer Timeline Displays here yet — keep optional floor merge.
                mergeFloorTimeline
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
    [orderAnchor],
  );

  return (
    <>
      <EntityStationPane
        entityKey={shipped.id}
        // The operator's bench: the editor dock commits, the centre edits.
        stance="work"
        identity={<OrderStationIdentity order={shipped} onExitToList={onClose} />}
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
                  activeInput === 'notes'
                    ? 'rounded-md bg-surface-sunken text-text-default'
                    : undefined
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
          </StationMoreDetails>
        }
        centre={orderContent}
        scrollClassName="pb-28"
        dock={
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
        displayTabs={displayTabs}
        displayIndexRows={displayIndexRows}
        activeSideTab={activeSideTab}
        onSideTabChange={(next) =>
          setActiveSideTab(next as SupportOrdersDisplayNav | null)
        }
        storageKey="support-orders-displays-push-width"
        ariaLabel="Support order displays"
        centerTestId="support-orders-station-center"
        displaysTestId="support-orders-displays-push"
        displaysResizeTestId="support-orders-displays-push-resize"
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
    </>
  );
}

export function SupportOrdersFocusHost({
  openOrderId,
  onClear,
}: {
  openOrderId: number;
  /** Paint-pending clear owned by the desk parent (`useSupportOrderOpenParam`). */
  onClear: () => void;
}) {
  const invalidate = useInvalidateSupportOrderCaches();
  const { data: order, isLoading, isError, refetch } = useSupportOrderDetail(openOrderId);

  const clearOpenOrder = onClear;

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
