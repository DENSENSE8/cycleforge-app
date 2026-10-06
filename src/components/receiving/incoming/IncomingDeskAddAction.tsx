'use client';

/**
 * Deliveries desk header CTA — the inbound **Add** (`InboundAddSplitAction`:
 * Add purchase order · Add return · Import orders, the same doors Purchasing
 * shows) plus this desk's own intake: the Zoho and eBay syncs.
 */

import { useMemo } from 'react';
import { RefreshCw, RotateCcw } from '@/components/Icons';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import type { SlicedActionMenuItem } from '@/design-system/primitives/SlicedActionDock';
import { InboundAddSplitAction } from '@/components/receiving/purchases/order-form/InboundAddSplitAction';
import { useIncomingSyncActions } from '@/components/sidebar/receiving/incoming/useIncomingSyncActions';
import { IncomingSyncDialog } from '@/components/sidebar/receiving/IncomingSyncDialog';

export function IncomingDeskAddAction() {
  const sync = useIncomingSyncActions();
  const { refreshZoho, refreshMarketplace, zohoRefreshing, marketplaceRefreshing } = sync;

  const syncs = useMemo<SlicedActionMenuItem[]>(
    () => [
      {
        label: zohoRefreshing ? 'Importing Zoho…' : 'Import Zoho POs',
        icon: <RefreshCw aria-hidden className="h-3.5 w-3.5" />,
        onClick: () => void refreshZoho(),
      },
      {
        label: marketplaceRefreshing ? 'Importing eBay…' : 'Import eBay purchases',
        icon: <RotateCcw aria-hidden className="h-3.5 w-3.5" />,
        onClick: () => void refreshMarketplace(),
      },
    ],
    [refreshZoho, refreshMarketplace, zohoRefreshing, marketplaceRefreshing],
  );

  const control = useMemo(() => <InboundAddSplitAction more={syncs} testId="incoming-add-purchase-order" />, [syncs]);

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{control}</DeskActionSlotRegistrar>
      <IncomingSyncDialog
        open={sync.incSyncOpen}
        kind={sync.incSyncKind}
        isRunning={sync.incSyncRunning}
        elapsedMs={sync.incSyncElapsedMs}
        result={sync.incSyncResult}
        onClose={() => sync.setIncSyncOpen(false)}
      />
    </>
  );
}
