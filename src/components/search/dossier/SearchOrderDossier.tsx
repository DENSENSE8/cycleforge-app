'use client';

/**
 * `/search?sel=order:` on the phone — the same record grammar as every other
 * search record (items → timeline · facts → related), stacked in one column.
 * The desk opens the full `OrderRecordView` instead (`SearchOrderRecord`).
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchEntityRecord } from '@/components/search/dossier/SearchEntityRecord';
import {
  searchOrderByIdResolveQuery,
  searchOrderResolveQuery,
} from '@/lib/search/search-order-resolve-query';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import { presentOrderFindEvents } from '@/lib/search/find-events-from-sources';
import { toast } from '@/lib/toast';
import {
  orderDossierFindings,
  orderDossierHandoffs,
  presentFact,
  type SearchDossierFact,
  type SearchDossierLink,
} from '@/lib/search/search-dossier-model';
import { getCurrentPSTDateKey } from '@/utils/date';

const EMPTY_TIMELINE = {
  events: [],
  lifecycle: [],
  stationEvents: [],
  threadMessages: [],
  orderNotes: [],
  signals: [],
  carrierEvents: [],
  rmaEvents: [],
  unitPhotos: [],
  pickSessions: [],
  packEvents: [],
};

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
        : resolveQuery.isError
          ? 'notfound'
          : (resolved?.status ?? 'loading');
  const order = resolved?.status === 'ok' ? resolved.order : null;
  const timelineQuery = useQuery({
    ...orderTimelineQuery(order?.id ?? 0),
    enabled: Boolean(order?.id),
  });
  useEffect(() => {
    if (timelineQuery.isError) {
      toast.error('Could not load order history or pack photos. Try again.');
    }
  }, [timelineQuery.isError, timelineQuery.errorUpdatedAt]);

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
  const view = ordersCompoundView(order, { stateLabel: null, delayDays: null, todayKey: getCurrentPSTDateKey() });
  const status =
    presentFact(order.latest_status_label) ||
    presentFact(order.shipment_status) ||
    (order.is_shipped ? 'shipped' : 'open');
  const sku = presentFact(order.sku);
  const tracking = presentFact(order.shipping_tracking_number);
  const qty = presentFact(order.quantity);
  const marketplaceId = presentFact(order.order_id);
  const itemNumber = presentFact(order.item_number);
  const platform = presentFact(order.account_source);
  const carrier = presentFact(order.carrier);
  const title = presentFact(view.title) || presentFact(order.product_title) || marketplaceId || `Order ${order.id}`;
  const facts: SearchDossierFact[] = [
    ...(marketplaceId ? [{ id: 'order', label: 'Order #', value: marketplaceId, copy: true }] : []),
    ...(platform ? [{ id: 'platform', label: 'Platform', value: platform }] : []),
    ...(tracking ? [{ id: 'tracking', label: 'Tracking #', value: tracking, copy: true }] : []),
    ...(carrier ? [{ id: 'carrier', label: 'Carrier', value: carrier }] : []),
    ...(itemNumber ? [{ id: 'item-number', label: 'Item #', value: itemNumber, copy: true }] : []),
  ];
  const related: SearchDossierLink[] = sku
    ? [{ id: `sku:${sku}`, label: 'SKU', value: sku, target: { query: sku } }]
    : [];
  const unitPhotos = [...(timelineQuery.data?.unitPhotos ?? [])].sort(
    (a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0),
  );

  return (
    <SearchEntityRecord
      entity="Order"
      reference={marketplaceId || `#${order.id}`}
      title={title}
      status={status}
      onBack={onBack}
      findings={findings}
      lines={[
        {
          id: order.id,
          title,
          imageUrl: view.thumbUrl ?? null,
          facts: [
            ...(sku ? [{ label: 'SKU', value: sku }] : []),
            ...(qty ? [{ label: 'Qty', value: qty }] : []),
            ...(presentFact(order.condition) ? [{ label: 'Condition', value: order.condition as string }] : []),
          ],
        },
      ]}
      linesLabel="item"
      emptyLines="No items on this order."
      events={presentOrderFindEvents(timelineQuery.data ?? EMPTY_TIMELINE, {
        quantity: order.quantity,
        isShipped: order.is_shipped,
        createdAt: order.created_at,
        tracking,
        packedAt: order.packed_at,
        packedByName: order.packed_by_name,
      })}
      emptyEvents="No history on this order yet."
      facts={facts}
      related={related}
      handoffs={orderDossierHandoffs(order.id, findings.length > 0)}
      photos={unitPhotos.map((photo) => ({
        id: String(photo.photoId),
        imgUrl: photo.thumbUrl,
        fullUrl: photo.fullUrl,
        alt: `${photo.source.replace('_', ' ')} photo`,
      }))}
    />
  );
}
