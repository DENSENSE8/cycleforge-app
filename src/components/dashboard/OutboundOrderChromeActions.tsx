'use client';

/**
 * Band-1 trailing CTAs for outbound desks (To-ship · Labels · Shipping · Pack):
 * labeled **Import** · **Add** — Unbox peer face, not a quiet Plus cube.
 *
 * ```text
 *   [ Import ] [ Add ]
 *    secondary   primary (Plus + Add)
 * ```
 *
 * Import opens CSV · channel sync · Backfill behind one labeled control
 * ({@link OrdersSyncPopover}). Add is a global intake CTA — opens manual
 * new-order directly, never buried in the Import panel. Same `CTA_FACE` as
 * {@link ReceivingBoxChromeActions}. Detail: `display/workbench-ops-queue.md`.
 */

import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';
import { cn } from '@/utils/_cn';

const CTA_FACE = cn(
  WORKBENCH_CHROME_PILL_CLASS,
  'h-full',
  'font-semibold uppercase tracking-widest',
);

export function OutboundOrderChromeActions({ onNewOrder }: { onNewOrder: () => void }) {
  return (
    <>
      <OrdersSyncPopover />
      <Button
        size="sm"
        variant="primary"
        icon={<Plus className="h-3.5 w-3.5" />}
        ariaLabel="New order entry"
        onClick={onNewOrder}
        className={CTA_FACE}
        data-testid="outbound-chrome-add"
      >
        Add
      </Button>
    </>
  );
}
