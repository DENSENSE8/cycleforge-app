'use client';

/**
 * Sync Orders expand panel for Incoming — {@link RightPaneOverlay} shell
 * (same wrapper as {@link ReceivingClaimModal} / {@link OrderSyncDialog}).
 * Hosts the Import Latest Orders + Backfill body formerly living in the
 * sidebar {@link OrdersSyncPopover}.
 */

import { useState } from 'react';
import { Database, X, Loader2, Check } from '@/components/Icons';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton } from '@/design-system/primitives';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { useAuth } from '@/contexts/AuthContext';
import { useOrdersSync } from '@/hooks/useOrdersSync';
import { OrderSyncDialog } from '@/components/sidebar/OrderSyncDialog';
import { AwaitingEbayPanel } from '@/components/unshipped/AwaitingEbayPanel';

type SyncTab = 'sync' | 'backfill';

export function IncomingOrdersSyncOverlay({
  open,
  onClose,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const [tab, setTab] = useState<SyncTab>('sync');
  const { has } = useAuth();
  const canImportOrders = has('orders.import');
  const sync = useOrdersSync();

  return (
    <>
      <RightPaneOverlay
        open={open}
        onClose={onClose}
        align="center"
        resizable
        storageKey="incoming-orders-sync-size"
        minWidth={420}
        minHeight={360}
        className="-mt-8 h-[min(80vh,36rem)] w-[min(94vw,28rem)]"
        aria-label="Sync orders"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
          <div>
            <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">Incoming</p>
            <h2 className="text-role-title font-bold text-text-default">Sync Orders</h2>
          </div>
          <IconButton
            icon={<X className="h-4 w-4" />}
            ariaLabel="Close"
            onClick={onClose}
            className="rounded-lg hover:bg-surface-sunken"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center gap-1 rounded-xl bg-surface-sunken p-1">
            {(['sync', 'backfill'] as SyncTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`ds-raw-button flex-1 rounded-lg px-3 py-1.5 text-role-eyebrow uppercase tracking-wider transition-colors ${
                  tab === t
                    ? 'bg-surface-card text-text-accent shadow-sm'
                    : 'text-text-soft hover:text-text-muted'
                }`}
              >
                {t === 'sync' ? 'Sync' : 'Backfill'}
              </button>
            ))}
          </div>

          {tab === 'sync' ? (
            <div className="space-y-3">
              {canImportOrders ? (
                <>
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
                    <button
                      type="button"
                      onClick={() => sync.setIsSyncDialogOpen(true)}
                      className="ds-raw-button flex w-full items-center justify-between gap-3 rounded-xl border border-border-accent bg-surface-accent/60 px-3 py-2.5 text-left transition hover:bg-surface-accent/80"
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
                      <span className="text-role-caption font-mono font-bold tabular-nums text-text-accent">
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
                      <p className="text-role-eyebrow font-bold leading-relaxed">{sync.status.message}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="px-1 py-6 text-center text-role-caption text-text-faint">
                  You don&apos;t have permission to import orders.
                </p>
              )}
            </div>
          ) : (
            <AwaitingEbayPanel onRefresh={onRefresh} />
          )}
        </div>
      </RightPaneOverlay>

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
