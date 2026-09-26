'use client';

/** To Ship View-only inspector shell — Band 3 can open layout / refine chrome with no selected order (`detail:orders-view`). */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import {
  OrdersViewChromeBridge,
  useOrdersViewChrome,
  useOrdersViewChromeOptional,
} from '@/components/outbound/orders/orders-view-chrome-context';

const ORDERS_VIEW_RAIL_ID = 'detail:orders-view';

export function OrdersViewControlsRail() {
  const { viewShellOpen, setViewShellOpen } = useOrdersViewChrome();
  // Capture under the desk provider — RightRailHost re-parents the node.
  const viewChrome = useOrdersViewChromeOptional();

  if (!viewShellOpen) return null;

  return (
    <DetailStackRailRegistrar
      id={ORDERS_VIEW_RAIL_ID}
      onClose={() => setViewShellOpen(false)}
      modal={false}
      edgeCollapse
      collapsedStrip={false}
      ariaLabel="Orders view controls"
    >
      <OrdersViewChromeBridge value={viewChrome}>
        <div
          className="flex h-full min-h-0 flex-col overflow-hidden"
          data-testid="orders-view-controls-rail"
          data-orders-view-only=""
        >
          <DeskInspectorIndexShell
            stance="standalone"
            title="View"
            ariaLabel="Orders view controls"
            testId="orders-view-inspector"
            className="bg-surface-card/90 backdrop-blur-xl"
            body={
              <div
                className="flex h-9 min-w-0 items-center gap-2 border-b border-border-hairline px-2"
                role="toolbar"
                aria-label="Orders view topics"
              >
                <div className="min-w-0 flex-1" />
              </div>
            }
          />
        </div>
      </OrdersViewChromeBridge>
    </DetailStackRailRegistrar>
  );
}
