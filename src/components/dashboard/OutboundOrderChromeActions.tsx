'use client';

/**
 * Band-1 trailing CTAs for outbound desks (To-ship · Labels · Shipping · Pack).
 *
 * **Ship desk (`layout="split"`)** — Add + Import are one ingest control:
 *
 * ```text
 *   [ + Add ]|[ v ]
 *            ├ Import from file
 *            ├ Import latest orders
 *            └ Backfill
 * ```
 *
 * Primary Add fires the single-item workflow. Chevron opens a flat flush menu
 * of the same-topic import commands (not a second Band-1 pill). Other outbound
 * desks keep the labeled `[ Import ] [ Add ]` pair until they adopt the split.
 *
 * Import hosts CSV · channel sync · Backfill. Add opens manual new-order
 * directly. Same `CTA_FACE` as {@link ReceivingBoxChromeActions} on the pair
 * layout. Detail: `display/workbench-ops-queue.md`.
 */

import { useRef, useState } from 'react';
import { Database, FileText, Loader2, Plus, RefreshCw } from '@/components/Icons';
import { Button, Popover, SplitButton, type SplitButtonItem } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';
import { AwaitingEbayPanel } from '@/components/unshipped/AwaitingEbayPanel';
import { OrderSyncDialog } from '@/components/sidebar/OrderSyncDialog';
import { useTableImportFilePicker } from '@/components/tables/import/TableImportFileButton';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import { useAuth } from '@/contexts/AuthContext';
import { useOrdersSync } from '@/hooks/useOrdersSync';
import { cn } from '@/utils/_cn';

const CTA_FACE = cn(
  WORKBENCH_CHROME_PILL_CLASS,
  'font-semibold uppercase tracking-widest',
);

/** Ship-desk split face — sentence case, flush-square, no tracking shout. */
const SPLIT_CTA_FACE = cn(WORKBENCH_CHROME_PILL_CLASS, 'font-semibold');

export function OutboundOrderChromeActions({
  onNewOrder,
  layout = 'pair',
}: {
  onNewOrder: () => void;
  /** `split` = Add primary + chevron import menu. Default pair for sibling desks. */
  layout?: 'pair' | 'split';
}) {
  if (layout === 'split') {
    return <OutboundOrderSplitActions onNewOrder={onNewOrder} />;
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

function OutboundOrderSplitActions({ onNewOrder }: { onNewOrder: () => void }) {
  const { has } = useAuth();
  const canImportOrders = has('orders.import');
  const csv = useTableImportFilePicker(ORDER_IMPORT_DESCRIPTOR);
  const sync = useOrdersSync();
  const groupRef = useRef<HTMLDivElement>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);

  const items: SplitButtonItem[] = canImportOrders
    ? [
        ...(csv.live
          ? [
              {
                key: 'import-file',
                label: 'Import from file',
                icon: <FileText className="h-3.5 w-3.5" />,
                onSelect: () => {
                  window.setTimeout(() => csv.open(), 0);
                },
              },
            ]
          : []),
        {
          key: 'import-latest',
          label: 'Import latest orders',
          icon: <Database className="h-3.5 w-3.5" />,
          disabled: sync.isTransferring,
          onSelect: () => {
            void sync.handleTransfer();
          },
        },
        {
          key: 'backfill',
          label: 'Backfill',
          icon: <RefreshCw className="h-3.5 w-3.5" />,
          onSelect: () => {
            window.setTimeout(() => setBackfillOpen(true), 0);
          },
        },
      ]
    : [];

  return (
    <>
      {csv.input}
      <div ref={groupRef} className="relative">
        <SplitButton
          label="Add"
          icon={<Plus className="h-3.5 w-3.5" />}
          ariaLabel="New order entry"
          menuAriaLabel="Import orders"
          groupAriaLabel="Add or import orders"
          onClick={onNewOrder}
          items={items}
          variant="primary"
          size="sm"
          className={SPLIT_CTA_FACE}
          data-testid="outbound-chrome-add"
          menuTestId="orders-data-menu"
          menuIcon={
            sync.isTransferring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined
          }
        />
      </div>
      {csv.error ? (
        <Popover
          open
          onClose={csv.clearError}
          anchorRef={groupRef}
          placement="bottom-end"
          gap={0}
          padded
          role="alert"
          aria-label="Import error"
          className="w-[20rem]"
        >
          <p className="text-role-eyebrow text-rose-700">{csv.error}</p>
        </Popover>
      ) : (
        <Popover
          open={backfillOpen}
          onClose={() => setBackfillOpen(false)}
          anchorRef={groupRef}
          placement="bottom-end"
          gap={0}
          padded
          role="dialog"
          aria-label="Backfill"
          className="w-[20rem]"
        >
          <AwaitingEbayPanel />
        </Popover>
      )}

      <OrderSyncDialog
        open={sync.isSyncDialogOpen}
        onClose={() => sync.setIsSyncDialogOpen(false)}
        isRunning={sync.isTransferring}
        elapsedMs={sync.elapsedMs}
        onCancel={sync.handleCancelTransfer}
        sheets={sync.sheetsTask}
        ecwid={sync.ecwidTask}
        exceptions={sync.exceptionsTask}
      />
    </>
  );
}
