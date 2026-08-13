'use client';

/**
 * Band-1 trailing CTAs for outbound desks (To-ship · Labels · Shipping · Pack).
 *
 * **Ship desk (`layout="ingest"`)** — one sentence-case Add. Methods
 * (manual · platform · file · sync · backfill) open as a `RightRailHost`
 * index→leaf via {@link OrderIngestRail} / `DeskInspectorIndexShell`. Never a
 * Band-1 dropdown of workspaces.
 *
 * Other outbound desks keep the labeled `[ Import ] [ Add ]` pair until they
 * adopt the ingest rail. Same `CTA_FACE` as {@link ReceivingBoxChromeActions}
 * on the pair layout.
 */

import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';
import { cn } from '@/utils/_cn';

const CTA_FACE = cn(
  WORKBENCH_CHROME_PILL_CLASS,
  'font-semibold uppercase tracking-widest',
);

/** Ship-desk Add — sentence case, flush-square, no tracking shout. */
const INGEST_CTA_FACE = cn(WORKBENCH_CHROME_PILL_CLASS, 'font-semibold');

export function OutboundOrderChromeActions({
  onNewOrder,
  layout = 'pair',
}: {
  onNewOrder: () => void;
  /** `ingest` = single Add that opens the ingest index. Default pair for sibling desks. */
  layout?: 'pair' | 'ingest';
}) {
  if (layout === 'ingest') {
    return (
      <Button
        size="sm"
        variant="primary"
        icon={<Plus className="h-3.5 w-3.5" />}
        ariaLabel="Add orders"
        onClick={onNewOrder}
        className={INGEST_CTA_FACE}
        data-testid="outbound-chrome-add"
      >
        Add
      </Button>
    );
  }

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
