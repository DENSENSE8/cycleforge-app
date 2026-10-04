'use client';

/**
 * `/m/orders/sync` — the phone's order-import screen.
 * Operator 2026-09-15: *"a tiny sync button in the middle top is a terrible
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Play, RefreshCw, X } from '@/components/Icons';
import { DetailDock } from '@/design-system/components/DetailDock';
import { IconButton } from '@/design-system/primitives/IconButton';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { useAuth } from '@/contexts/AuthContext';
import { useOrdersSync } from '@/hooks/useOrdersSync';
import { useOrdersSyncDemo } from '@/hooks/useOrdersSyncDemo';
import { OrderSyncRunView } from '@/features/orders/sync/OrderSyncRunView';

/** Where X and the acknowledged result both land. */
const QUEUE_HREF = '/m/work';

export function MobileOrderSyncScreen() {
  const router = useRouter();
  const { has } = useAuth();
  const canImportOrders = has('orders.import');
  const sync = useOrdersSync();
  const demo = useOrdersSyncDemo();

  const leave = useCallback(() => {
    router.replace(QUEUE_HREF);
  }, [router]);

  const activeRun = demo.run
    ? {
        run: demo.run,
        elapsedMs: demo.elapsedMs,
        isRunning: demo.isRunning,
        outcome: demo.outcome,
        detail: demo.detail,
        demo: true,
        cancel: demo.cancel,
        dismiss: () => {
          demo.dismiss();
          leave();
        },
      }
    : sync.run
      ? {
          run: sync.run,
          elapsedMs: sync.elapsedMs,
          isRunning: sync.isTransferring,
          outcome: sync.status,
          detail: sync.runDetail,
          demo: false,
          cancel: sync.handleCancelTransfer,
          dismiss: () => {
            sync.dismissRun();
            leave();
          },
        }
      : null;

  if (activeRun) {
    return (
      <OrderSyncRunView
        run={activeRun.run}
        elapsedMs={activeRun.elapsedMs}
        isRunning={activeRun.isRunning}
        onCancel={activeRun.cancel}
        onDismiss={activeRun.dismiss}
        outcome={activeRun.outcome}
        detail={activeRun.detail}
        demo={activeRun.demo}
        className="h-full"
      />
    );
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-surface-card"
      data-testid="mobile-order-sync"
    >
      {/* The ONE top bar for this route. X left, title beside it — no host
          header above this, and no second closer inside the body. */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-soft px-3">
        <IconButton
          icon={<X className="h-5 w-5" aria-hidden />}
          ariaLabel="Close import"
          size="md"
          // 44×44, the phone touch minimum — `size="md"` paints 32 and the X
          // was under-target. Same forced measure MobileDetailTopBar's back
          // chevron carries.
          className="h-11 w-11 shrink-0"
          onClick={leave}
          data-testid="mobile-order-sync-close"
        />
        <h1 className="min-w-0 flex-1 truncate text-role-body font-semibold text-text-default">
          Import orders
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <p className={`${microBadge} text-text-soft`}>Order import</p>
        <h2 className="mt-1 text-role-title font-semibold text-text-default">
          Bring in the latest orders
        </h2>
        <p className="mt-2 max-w-prose text-role-caption leading-relaxed text-text-muted">
          Reads ShipStation, attaches tracking from the Google Sheets backup
          and every other linked platform, then resolves open
          scan exceptions against whatever just landed. You will see each step
          and its count as it runs, and the result stays on screen until you
          close it.
        </p>

        {!canImportOrders ? (
          <p className="mt-5 text-role-caption text-text-danger">
            You do not have permission to import orders. Ask an admin for
            <span className="font-mono"> orders.import</span>.
          </p>
        ) : null}
      </div>

      {/*
        The floor: floating verbs, no bar or rule behind them (owner 2026-10-03).
        Sync now is the full-width primary under the thumb; Demo is the quiet
        twin above it — same run surface, sample rows, no network and no writes.
      */}
      <DetailDock<'demo' | 'sync'>
        label="Order import actions"
        placement="sheet"
        verbs={[
          { id: 'demo', label: 'Demo sync (sample data)', icon: <Play />, testId: 'mobile-order-sync-demo' },
          { id: 'sync', label: 'Sync now', icon: <RefreshCw />, primary: true, disabled: !canImportOrders, testId: 'mobile-order-sync-start' },
        ]}
        onVerb={(verb) => (verb === 'demo' ? demo.start() : sync.handleTransfer())}
      />
    </section>
  );
}
