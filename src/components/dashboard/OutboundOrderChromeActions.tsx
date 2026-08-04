'use client';

/**
 * Shared workbench-chrome CTAs for order ingest — Import (blue) + Add (green).
 * Golden source: Labels station header; reused by Dashboard · Outbound,
 * `/test` Shipping, and `/pack`.
 */

import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';
import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';

export function OutboundOrderChromeActions({ onNewOrder }: { onNewOrder: () => void }) {
  return (
    <>
      <OrdersSyncPopover triggerVariant="header" />
      <Button
        size="sm"
        onClick={onNewOrder}
        ariaLabel="New order entry"
        icon={<Plus />}
        className={cn(
          WORKBENCH_CHROME_PILL_CLASS,
          'font-semibold uppercase tracking-widest bg-emerald-600 shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700',
        )}
      >
        Add
      </Button>
    </>
  );
}
