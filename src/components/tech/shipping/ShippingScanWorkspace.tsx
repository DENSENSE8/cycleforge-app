'use client';

import { useEffect, useMemo, useState } from 'react';
import { Barcode } from '@/components/Icons';
import { SectionTabsSlider, type SectionTab } from '@/design-system/components';
import { initSkuSerialGroups } from '@/lib/tech/sku-serial-groups';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { Order } from '@/components/station/upnext/upnext-types';
import { ShippingEntityContextHeader } from './ShippingEntityContextHeader';
import { ShippingSkuSerialRows } from './ShippingSkuSerialRows';
import { ShippingCapturedUnits } from './ShippingCapturedUnits';
import type { ShippingView } from './terminal/shipping-terminal';

/**
 * Unbox-shaped shipping workspace — entity-context header
 * ({@link ShippingEntityContextHeader} → CartonContextCard SoT) +
 * {@link SectionTabsSlider} seam + focused tab bodies (SKU↔serial pairing,
 * captured units).
 *
 * Terminal dock: registered under STATION_TERMINAL_REGISTRY.shipping with every
 * tab mapped to `none` (scan-driven; no sticky CTA yet). Future scan-complete
 * CTA → `./terminal/shipping-terminal.ts`.
 */
export function ShippingScanWorkspace({
  activeOrder,
  previewOrder,
  onRemoveSerial,
  onChangeCondition,
  isMutatingCondition,
}: {
  activeOrder: ActiveStationOrder;
  /** Up Next preview row — supplies OOS + status fields missing from ActiveStationOrder. */
  previewOrder?: Order;
  onRemoveSerial?: (serial: string, index: number) => Promise<void> | void;
  onChangeCondition?: (next: string) => void | Promise<void>;
  isMutatingCondition?: boolean;
}) {
  const [view, setView] = useState<ShippingView>('ship');
  const hasUnits = activeOrder.serialNumbers.length > 0;
  const isShipped =
    previewOrder?.status === 'SHIPPED' || previewOrder?.status === 'SHIPPED_EXT';

  // Drop off the units tab when the last serial is undone.
  useEffect(() => {
    if (!hasUnits && view === 'units') setView('ship');
  }, [hasUnits, view]);

  const orderForContext = useMemo(() => {
    if (activeOrder.skuSerialGroups && activeOrder.skuSerialGroups.length > 0) {
      return activeOrder;
    }
    return {
      ...activeOrder,
      skuSerialGroups: initSkuSerialGroups(activeOrder.sku, activeOrder.serialNumbers),
    };
  }, [activeOrder]);

  const tabs = useMemo(() => {
    const items: SectionTab[] = [
      {
        id: 'ship',
        label: 'Ship',
        icon: Barcode,
        content: (
          <ShippingSkuSerialRows
            activeOrder={orderForContext}
            onChangeCondition={onChangeCondition}
            isMutatingCondition={isMutatingCondition}
            isShipped={isShipped}
          />
        ),
      },
    ];
    if (hasUnits) {
      items.push({
        id: 'units',
        label: `Units · ${activeOrder.serialNumbers.length}`,
        icon: Barcode,
        count: activeOrder.serialNumbers.length,
        content: (
          <ShippingCapturedUnits
            activeOrder={activeOrder}
            onRemoveSerial={onRemoveSerial}
          />
        ),
      });
    }
    return items;
  }, [
    orderForContext,
    onChangeCondition,
    isMutatingCondition,
    isShipped,
    hasUnits,
    activeOrder,
    onRemoveSerial,
  ]);

  return (
    <div className="space-y-4">
      <ShippingEntityContextHeader
        activeOrder={activeOrder}
        outOfStock={previewOrder?.out_of_stock}
      />

      <SectionTabsSlider
        tabs={tabs}
        value={view}
        onChange={(id) => setView(id as ShippingView)}
        ariaLabel="Shipping displays"
      />
    </div>
  );
}
