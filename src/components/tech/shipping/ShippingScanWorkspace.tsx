'use client';

import { useEffect, useMemo, useState } from 'react';
import { Barcode, History } from '@/components/Icons';
import { SectionTabsSlider } from '@/design-system/components';
import { buildSectionTabs, WorkspaceTimelineTab } from '@/components/station/workbench';
import { initSkuSerialGroups } from '@/lib/tech/sku-serial-groups';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { Order } from '@/components/station/upnext/upnext-types';
import { ShippingSkuSerialRows } from './ShippingSkuSerialRows';
import { ShippingCapturedUnits } from './ShippingCapturedUnits';
import type { ShippingView } from './terminal/shipping-terminal';

/**
 * Shipping section tabs — the {@link SectionTabsSlider} seam plus its focused
 * tab bodies (SKU↔serial pairing, captured units, timeline).
 *
 * Mounts in the `tabs` slot of `ActiveOrderWorkspace`'s `StationWorkbench`.
 * The station chrome around it belongs to the host: identity rides the sticky
 * `StationContextBar` bookmark (`ShippingEntityContextHeader` →
 * CartonContextCard density=bar) and notices sit in `entityContext` — never
 * re-mount either here, or the bookmark scrolls with the body instead of
 * hanging under GlobalHeader.
 *
 * Terminal dock: preview Start CTA lives on ActiveOrderWorkspace via
 * STATION_TERMINAL_REGISTRY.shipping defaultKind `start`. Active scan tabs
 * map to `none` (scan-driven).
 */
export function ShippingScanWorkspace({
  activeOrder,
  previewOrder,
  onRemoveSerial,
  onChangeCondition,
  isMutatingCondition,
}: {
  activeOrder: ActiveStationOrder;
  /** Up Next preview row — supplies status fields missing from ActiveStationOrder. */
  previewOrder?: Order;
  onRemoveSerial?: (serial: string, index: number) => Promise<void> | void;
  onChangeCondition?: (next: string) => void | Promise<void>;
  isMutatingCondition?: boolean;
}) {
  const [view, setView] = useState<ShippingView>('ship');
  const hasUnits = activeOrder.serialNumbers.length > 0;
  const isShipped =
    previewOrder?.status === 'SHIPPED' || previewOrder?.status === 'SHIPPED_EXT';

  const tracking =
    String(activeOrder.tracking ?? '').trim() ||
    String(previewOrder?.shipping_tracking_number ?? '').trim();
  const orderId = String(activeOrder.orderId ?? '').trim();
  const hasTimelineTab =
    tracking.length > 0 || orderId.length > 0 || hasUnits;

  useEffect(() => {
    if (!hasUnits && view === 'units') setView('ship');
    if (!hasTimelineTab && view === 'timeline') setView('ship');
  }, [hasUnits, hasTimelineTab, view]);

  const orderForContext = useMemo(() => {
    if (activeOrder.skuSerialGroups && activeOrder.skuSerialGroups.length > 0) {
      return activeOrder;
    }
    return {
      ...activeOrder,
      skuSerialGroups: initSkuSerialGroups(activeOrder.sku, activeOrder.serialNumbers),
    };
  }, [activeOrder]);

  const tabs = useMemo(
    () =>
      buildSectionTabs([
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
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          visible: hasTimelineTab,
          content: (
            <WorkspaceTimelineTab
              orderId={orderId || null}
              tracking={tracking || null}
              serials={activeOrder.serialNumbers}
            />
          ),
        },
      ]),
    [
      orderForContext,
      onChangeCondition,
      isMutatingCondition,
      isShipped,
      hasUnits,
      hasTimelineTab,
      activeOrder,
      onRemoveSerial,
      orderId,
      tracking,
    ],
  );

  return (
    <SectionTabsSlider
      tabs={tabs}
      value={view}
      onChange={(id) => setView(id as ShippingView)}
      ariaLabel="Shipping displays"
    />
  );
}
