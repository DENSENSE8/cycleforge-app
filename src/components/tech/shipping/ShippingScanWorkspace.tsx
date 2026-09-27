'use client';

import { useMemo } from 'react';
import { initSkuSerialGroups } from '@/lib/tech/sku-serial-groups';
import type { ActiveStationOrder } from '@/hooks/useDeskPickController';
import type { Order } from '@/components/station/upnext/upnext-types';
import { ShippingSkuSerialRows } from './ShippingSkuSerialRows';

/** Ready-to-Pack centre ops-flow — SKU/serial pairing rows only. */
export function ShippingScanWorkspace({
  activeOrder,
  previewOrder,
}: {
  activeOrder: ActiveStationOrder;
  /** Up Next preview row — supplies status fields missing from ActiveStationOrder. */
  previewOrder?: Order;
}) {
  const orderForContext = useMemo(() => {
    if (activeOrder.skuSerialGroups && activeOrder.skuSerialGroups.length > 0) {
      return activeOrder;
    }
    return {
      ...activeOrder,
      skuSerialGroups: initSkuSerialGroups(activeOrder.sku, activeOrder.serialNumbers),
    };
  }, [activeOrder]);

  // previewOrder reserved for future Pack status chips; keep prop for host parity.
  void previewOrder;

  return <ShippingSkuSerialRows activeOrder={orderForContext} />;
}
