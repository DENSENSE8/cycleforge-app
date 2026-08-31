'use client';

/**
 * `/search?sel=order:{id}` centre — Status band, then Items band.
 *
 * The shape every entity pane now follows. It composes
 * {@link SearchEntityCentre}, which owns the bands; this file owns only WHAT
 * goes in them for an order.
 */

import { OrderPipelineSection } from '@/components/shipped/details-panel/OrderPipelineSection';
import { SearchEntityCentre } from './SearchEntityCentre';
import { SearchOrderItems } from './SearchOrderItems';
import type { AutoCollapseController } from '@/components/station/collapse';
import type { ShippedOrder } from '@/types/orders';

export function SearchOrderCentre({
  order,
  collapse,
}: {
  order: ShippedOrder;
  collapse: AutoCollapseController;
}) {
  return (
    <SearchEntityCentre
      entity="order"
      collapse={collapse}
      status={<OrderPipelineSection shipped={order} />}
      items={<SearchOrderItems order={order} />}
    />
  );
}
