'use client';

import { Database, FileText, Loader2, X, Check } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { useAuth } from '@/contexts/AuthContext';
import { useOrdersSync } from '@/hooks/useOrdersSync';
import { OrderSyncDialog } from '@/components/sidebar/OrderSyncDialog';
import { AwaitingEbayPanel } from '@/components/unshipped/AwaitingEbayPanel';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchChromeCubeMenu,
  type WorkbenchChromeMenuTab,
} from '@/components/dashboard/workbench-chrome-cube-menu';
import { TableImportFileButton } from '@/components/tables/import/TableImportFileButton';
import { ORDER_IMPORT_DESCRIPTOR } from '@/lib/orders/order-import-descriptor';
import { cn } from '@/utils/_cn';

const CTA_FACE = cn(
  WORKBENCH_CHROME_PILL_CLASS,
  'font-semibold uppercase tracking-widest',
);

/**
 * Band-1 **Import** control — CSV · channel sync · Backfill as tabs behind one
 * labeled Import CTA (peer of Add on {@link OutboundOrderChromeActions}).
 *
 * Import leads with the CSV file (the operator-driven path) and keeps the
 * channel sync below it; detailed stacked per-source progress opens in the
 * non-modal {@link OrderSyncDialog} right rail. Backfill is the eBay/Ecwid
 * catch-up + integrity check. Manual new-order lives on the labeled Add peer,
 * not in this panel.
 */
export function OrdersSyncPopover({ onRefresh }: { onRefresh?: () => void }) {
  const { has } = useAuth();
  const canImportOrders = has('orders.import');
  const sync = useOrdersSync();

  const tabs: WorkbenchChromeMenuTab[] = [
    {
      id: 'import',
      label: 'Import',
      content: canImportOrders ? (
        <div className="space-y-3">
          {/* Shared seam control — the entry point is not hardcoded to this
              popover or to this desk. A file is the operator-driven path, so it
              leads; the channel sync below it is the scheduled one. */}
          <TableImportFileButton
            descriptor={ORDER_IMPORT_DESCRIPTOR}
            icon={<FileText className="h-3.5 w-3.5" />}
            className="w-full text-role-micro uppercase tracking-[0.2em]"
            disabled={sync.isTransferring}
            description="Opens desk staging — triage Ready / Action required, then confirm into To-Ship."
          />

          <div className="border-t border-border-hairline pt-3">
            <p className="mb-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
              Channel sync
            </p>
          </div>
          <input
            type="text"
            value={sync.manualSheetName}
            onChange={(e) => sync.setManualSheetName(e.target.value)}
            placeholder="e.g., Sheet_01_14_2026"
            className="w-full rounded-xl border border-border-soft bg-surface-card px-3 py-2 font-mono text-role-caption text-text-default outline-none transition-all focus:border-border-accent"
            disabled={sync.isTransferring}
          />
          {sync.isTransferring ? (
            <Button
              variant="danger"
              size="lg"
              onClick={sync.handleCancelTransfer}
              icon={<X className="h-3.5 w-3.5" />}
              className="w-full text-role-micro uppercase tracking-[0.2em]"
            >
              Cancel Import
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={sync.handleTransfer}
              icon={<Database className="h-3.5 w-3.5" />}
              className="w-full text-role-micro uppercase tracking-[0.2em]"
            >
              Import Latest Orders
            </Button>
          )}

          {sync.isTransferring ||
          sync.sheetsTask.status !== 'idle' ||
          sync.ecwidTask.status !== 'idle' ? (
            // ds-raw-button: composite text-left status row (icon + label +
            // "View details" + elapsed time), justify-between — not a standard
            // action button.
            <button
              type="button"
              onClick={() => sync.setIsSyncDialogOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-accent bg-surface-accent/60 px-3 py-2.5 text-left transition hover:bg-surface-accent/80"
            >
              <div className="flex min-w-0 items-center gap-2">
                {sync.isTransferring ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-text-faint" />
                ) : (
                  <Check className="h-3.5 w-3.5 text-text-accent" />
                )}
                <span className={`${sectionLabel} text-text-accent`}>
                  {sync.isTransferring ? 'Importing…' : 'Import complete'}
                </span>
                <span className="text-role-eyebrow text-text-accent">View details</span>
              </div>
              <span className="text-role-caption font-mono font-semibold tabular-nums text-text-accent">
                {(sync.elapsedMs / 1000).toFixed(1)}s
              </span>
            </button>
          ) : null}

          {sync.status ? (
            <div
              className={`rounded-xl border px-3 py-2 ${
                sync.status.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              <p className="text-role-eyebrow leading-relaxed">{sync.status.message}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="px-1 py-6 text-center text-role-caption text-text-faint">
          You don&apos;t have permission to import orders.
        </p>
      ),
    },
    {
      id: 'backfill',
      label: 'Backfill',
      content: <AwaitingEbayPanel onRefresh={onRefresh} />,
    },
  ];

  return (
    <>
      <WorkbenchChromeCubeMenu
        label={sync.isTransferring ? 'Syncing orders' : 'Import orders'}
        icon={
          sync.isTransferring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )
        }
        labeledTrigger={{
          children: 'Import',
          variant: 'secondary',
          className: CTA_FACE,
          icon: sync.isTransferring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          ),
        }}
        tabs={tabs}
        data-testid="orders-data-menu"
      />

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
