'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchDossierFrame } from '@/components/search/dossier/SearchDossierFrame';
import {
  searchOrderByIdResolveQuery,
  searchOrderResolveQuery,
} from '@/lib/search/search-order-resolve-query';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { shippedOrderToItemRecords } from '@/lib/item-record/shipped-order-item-record';
import { presentFindDossier } from '@/lib/search/find-dossier-model';
import { presentOrderFindEvents } from '@/lib/search/find-events-from-sources';
import {
  joinMeta,
  orderDossierFindings,
  orderDossierHandoffs,
  presentFact,
} from '@/lib/search/search-dossier-model';

export function SearchOrderDossier({
  orderId,
  onBack,
}: {
  orderId: string | number;
  onBack?: () => void;
}) {
  const token = String(orderId ?? '').trim();
  const orderPk = Number(orderId);
  const resolveByPk = Number.isSafeInteger(orderPk) && orderPk > 0;
  const byIdQuery = useQuery({
    ...searchOrderByIdResolveQuery(resolveByPk ? orderPk : 0),
    enabled: resolveByPk,
  });
  const byTokenQuery = useQuery({
    ...searchOrderResolveQuery(token),
    enabled: !resolveByPk && token.length > 0,
  });
  const resolveQuery = resolveByPk ? byIdQuery : byTokenQuery;
  const resolved = resolveQuery.data;
  const resolveStatus =
    (resolveQuery.isPending || resolveQuery.isLoading) && !resolved
      ? 'loading'
      : resolved?.status === 'ok'
        ? 'ok'
        : resolved?.status === 'fba'
          ? 'fba'
          : resolveQuery.isError
            ? 'notfound'
            : (resolved?.status ?? 'loading');
  const order = resolved?.status === 'ok' ? resolved.order : null;
  const timelineQuery = useQuery({
    ...orderTimelineQuery(order?.id ?? 0),
    enabled: Boolean(order?.id),
  });

  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (resolveStatus === 'loading') return;
    primaryPaint?.onPrimaryPainted();
  }, [resolveStatus, primaryPaint]);

  useEffect(() => {
    const pending = resolveStatus === 'loading';
    setGlobalSearchPending(pending);
    return () => {
      clearGlobalSearchPending();
    };
  }, [resolveStatus]);

  if (resolveStatus === 'loading') {
    return <div className="min-h-0 flex-1" aria-busy />;
  }

  if (resolveStatus === 'fba') {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="FBA order"
          description="Amazon fulfills this order. Open the FBA desk for channel-specific detail."
        />
      </div>
    );
  }

  if (resolveStatus === 'notfound' || !order) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Order not found"
          description="No order matched this selection. Try another search hit."
        />
      </div>
    );
  }

  const findings = orderDossierFindings({
    id: order.id,
    item_number: order.item_number,
    sku: order.sku,
    sku_catalog_id: null,
  });
  const items = shippedOrderToItemRecords(order);
  const status =
    presentFact(order.latest_status_label) ||
    presentFact(order.shipment_status) ||
    (order.is_shipped ? 'shipped' : 'open');
  const sku = presentFact(order.sku);
  const tracking = presentFact(order.shipping_tracking_number);
  const qty = presentFact(order.quantity);
  const marketplaceId = presentFact(order.order_id);
  const title = presentFact(order.product_title) || marketplaceId || `Order ${order.id}`;
  const facts = [
    { id: 'status', label: 'Status', value: status },
    ...(marketplaceId ? [{ id: 'order', label: 'Order', value: marketplaceId }] : []),
    ...(sku ? [{ id: 'sku', label: 'SKU', value: sku }] : []),
    ...(qty ? [{ id: 'qty', label: 'Qty', value: qty }] : []),
    ...(tracking ? [{ id: 'tracking', label: 'Tracking', value: tracking }] : []),
  ];
  const handoffs = orderDossierHandoffs(order.id, findings.length > 0);
  const streamEvents = presentOrderFindEvents(timelineQuery.data ?? {
    events: [],
    lifecycle: [],
    stationEvents: [],
    threadMessages: [],
    carrierEvents: [],
    rmaEvents: [],
    unitPhotos: [],
    pickSessions: [],
    packEvents: [],
  }, {
    quantity: order.quantity,
    isShipped: order.is_shipped,
    createdAt: order.created_at,
    tracking,
    packedAt: order.packed_at,
    packedByName: order.packed_by_name,
  });
  const dossier = presentFindDossier({
    entityType: 'order',
    id: order.id,
    title,
    status,
    facts,
    findings,
    handoffs,
    events: streamEvents,
  });

  return (
    <SearchDossierFrame
      entity="Order"
      title={title}
      onBack={onBack}
      outline={dossier.outline}
      findings={findings}
      facts={facts}
      events={dossier.events}
      lines={items.map((item) => ({
        id: item.id,
        title: item.title,
        meta: joinMeta([item.sku, item.quantity?.expected != null ? `qty ${item.quantity.expected}` : null, item.conditionGrade]),
      }))}
      emptyLines="No chronology on this order yet."
      handoffs={handoffs}
    />
  );
}

