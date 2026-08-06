'use client';

import { useEffect, useMemo, useState } from 'react';
import { Barcode } from '@/components/Icons';
import { SectionTabsSlider } from '@/design-system/components';
import { buildSectionTabs } from '@/components/station/workbench';
import { initSkuSerialGroups } from '@/lib/tech/sku-serial-groups';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { Order } from '@/components/station/upnext/upnext-types';
import { ShippingSkuSerialRows } from './ShippingSkuSerialRows';
import { ShippingCapturedUnits } from './ShippingCapturedUnits';
import type { ShippingView } from './terminal/shipping-terminal';

/**
 * Shipping centre work tabs — Ship · Units only.
 * Timeline is a Displays push body on {@link ActiveOrderWorkspace}
 * (scan-station Displays SoT — reference tools leave the mid-canvas strip).
 *
 * Mounts in the `tabs` slot of `ActiveOrderWorkspace`'s `StationWorkbench`.
 */
export function ShippingScanWorkspace({
  activeOrder,
  previewOrder,
  onRemoveSerial,
}: {
  activeOrder: ActiveStationOrder;
  /** Up Next preview row — supplies status fields missing from ActiveStationOrder. */
  previewOrder?: Order;
  onRemoveSerial?: (serial: string, index: number) => Promise<void> | void;
}) {
  const [view, setView] = useState<ShippingView>('ship');
  const hasUnits = activeOrder.serialNumbers.length > 0;

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

  // previewOrder reserved for future Ship status chips; keep prop for host parity.
  void previewOrder;

  const tabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'ship',
          label: 'Ship',
          icon: Barcode,
          content: (
            <ShippingSkuSerialRows activeOrder={orderForContext} />
          ),
        },
        {
          id: 'units',
          label: `Units · ${activeOrder.serialNumbers.length}`,
          icon: Barcode,
          count: activeOrder.serialNumbers.length,
          visible: hasUnits,
          content: (
            <ShippingCapturedUnits
              activeOrder={activeOrder}
              onRemoveSerial={onRemoveSerial}
            />
          ),
        },
      ]),
    [
      orderForContext,
      hasUnits,
      activeOrder,
      onRemoveSerial,
    ],
  );

  return (
    <SectionTabsSlider
      tabs={tabs}
      value={view}
      onChange={(id) => setView(id as ShippingView)}
      ariaLabel="Shipping work"
      className="gap-0 space-y-0"
    />
  );
}
