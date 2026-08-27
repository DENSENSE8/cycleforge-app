'use client';

/**
 * `/search?sel=order:` Items block — the order's item, on the shared surface.
 *
 * Until 2026-08-22 this block mounted `ShippedDetailsPanelContent` with
 * `activeSection="product"`: the find surface reached into the SHIPPED panel's
 * internals, dragged in a tab-gated component that renders eight sections it
 * would never show, and inherited a condition editor it had to switch off by
 * hand. It also paid, on every order open, for a by-tracking SKU round trip
 * that only the shipping section could have rendered.
 *
 * What is left is the ledger and nothing else. The item-number and
 * marketplace-SKU blocks that used to stack underneath were removed at the
 * operator's instruction (2026-08-22): this is a FIND surface — it exists to
 * confirm you landed on the right record, and the identifier reference band
 * belongs on the work surfaces that act on it. The shipped panel still carries
 * both. That is why they were dropped here and not from the shared component.
 */

import { useMemo } from 'react';
import { ItemRecordCard } from '@/design-system/components/item-record';
import { FnskuCatalogInfoPanel } from '@/components/fba/FnskuCatalogInfoPanel';
import { getFnskuCatalogValue, isFnskuCatalogContext } from '@/utils/fnsku-catalog';
import { shippedOrderToItemRecords } from '@/lib/item-record/shipped-order-item-record';
import type { ShippedOrder } from '@/types/orders';

export function SearchOrderItems({ order }: { order: ShippedOrder }) {
  const items = useMemo(() => shippedOrderToItemRecords(order), [order]);

  const fnskuValue = getFnskuCatalogValue(order);
  const showFnskuCatalog = isFnskuCatalogContext(order) && Boolean(fnskuValue);

  return (
    <ItemRecordCard
      items={items}
      topRule={false}
      emptyTitle="No item"
      emptyDescription="This order carries no product facts."
      footer={
        showFnskuCatalog ? (
          <FnskuCatalogInfoPanel
            fnsku={fnskuValue}
            productTitle={order.product_title}
            condition={order.condition}
            sku={order.sku}
            asin={(order as { asin?: string | null }).asin ?? null}
            sourceKey={order.id}
            // Preview surface — the catalog quick-add is a write.
            allowEdit={false}
          />
        ) : null
      }
    />
  );
}
