'use client';

/**
 * The inbound desks' top-right **Add** (Purchasing, Deliveries): the click adds
 * a purchase order (`/purchasing/new`); the menu adds a return
 * (`?type=RETURN`) or imports orders from a file (`/purchasing/import`). A desk
 * may append its own intake verbs below a rule (Deliveries: the Zoho / eBay
 * syncs). The host registers it in its primary header slot.
 */

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Package, RotateCcw } from '@/components/Icons';
import { DeskHeaderSplitAction } from '@/design-system/components/DeskHeaderSplitAction';
import type { SlicedActionMenuItem } from '@/design-system/primitives/SlicedActionDock';
import { inboundOrderFormHref } from '@/lib/inbound/inbound-order-compose';
import { RECEIVING_PATHS } from '@/lib/nav/route-tree';

export function InboundAddSplitAction({ more = [], testId }: { more?: readonly SlicedActionMenuItem[]; testId: string }) {
  const router = useRouter();
  const addOrder = useCallback(() => router.push(inboundOrderFormHref('desk')), [router]);
  const menu = useMemo<SlicedActionMenuItem[]>(
    () => [
      {
        label: 'Add purchase order',
        icon: <Package aria-hidden className="h-3.5 w-3.5" />,
        onClick: addOrder,
      },
      {
        label: 'Add return',
        icon: <RotateCcw aria-hidden className="h-3.5 w-3.5" />,
        onClick: () => router.push(inboundOrderFormHref('desk', { type: 'RETURN' })),
      },
      {
        label: 'Import orders',
        icon: <FileText aria-hidden className="h-3.5 w-3.5" />,
        onClick: () => router.push(RECEIVING_PATHS.purchaseImport),
      },
      ...more.map((item, index) => (index === 0 ? { ...item, separatorBefore: true } : item)),
    ],
    [addOrder, more, router],
  );
  return (
    <div className="flex shrink-0" data-testid={testId}>
      <DeskHeaderSplitAction
        tone="blue"
        icon={<Package aria-hidden className="h-3.5 w-3.5" />}
        label="Add"
        title="Add purchase order"
        onClick={addOrder}
        menuPlacement="bottom"
        menuChrome="dropdown"
        menuLabel="More ways to add"
        menu={menu}
        className="shrink-0"
      />
    </div>
  );
}
