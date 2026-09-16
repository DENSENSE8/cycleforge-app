'use client';

/**
 * `/m/orders/sync` — the phone's order-import screen.
 *
 * ## Why a page and not a sheet on the queue
 *
 * Operator 2026-09-15: *"a tiny sync button in the middle top is a terrible
 * display … title top left, a big CTA on the right side, that will then go to
 * another page with an X button top left."* An import is a minute-long job with
 * its own result to read, so it gets its own destination. The queue keeps one
 * job (read rows); this screen keeps one job (bring rows in).
 *
 * The route is on `OWN_TOP_BAR_PREFIXES`, so the shell paints no host header
 * here and this screen owns the ONE top bar — the same rule that stops the
 * kiosk's double-band bug. X exits; there is no second closer.
 *
 * ## Three states, all of them designed
 *
 * - **Idle** — what the import will do, the optional tab override, and the two
 *   ways to start it.
 * - **Running** — {@link OrderSyncRunView}'s measured ledger; its own X cancels.
 * - **Settled** — the same ledger, frozen, with the result sentence. Nothing
 *   auto-dismisses: the operator acknowledges, and lands back on the queue.
 *
 * No door in the nav. This screen is reachable only from the outbound orders
 * queue's top-bar action (`/m/work`), which is the surface whose rows it
 * changes — a lane the phone can run needs no second entrance.
 *
 * ## Why X, and why not MobileDetailTopBar
 *
 * {@link MobileDetailTopBar} is the shared bar for phone RECORD screens: a back
 * chevron, a title stack, and a Scan seat. This is not a record — it is a FLOW
 * with an exit, which is exactly the case {@link StepProgressHeader} names when
 * it says a back affordance inside a flow uses X because the semantic is "exit
 * the flow". Scan is deliberately absent: an operator mid-import has one job,
 * and the run's own header is the only chrome once it starts.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Play, RefreshCw, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
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
          Reads the Google Sheet and Ecwid, attaches tracking, then resolves open
          scan exceptions against whatever just landed. You will see each step
          and its count as it runs, and the result stays on screen until you
          close it.
        </p>

        {/*
          The tab override. Blank is the answer almost every day — the job picks
          the current tab itself — so this is a field the operator may ignore,
          never a required step in front of the verb. It reads the SAME
          `manualSheetName` the hook has always threaded into `SyncOpts`
          (`handleTransfer` → POST body → the route's `BodySchema`); this screen
          is the first UI for it since the ingest rail's `sync` leaf was deleted,
          and the phone gets it first (SURFACE_LAW: every operator verb is
          completable on `/m` before a desk consumes it).

          `mono` because the value is a spreadsheet tab id an operator copies
          character-for-character (`Sheet_01_14_2026`), and a proportional font
          hides a wrong digit. Demo never reads it — scripted rows have no sheet.
        */}
        {canImportOrders ? (
          <div className="mt-6">
            <TextField
              label="Sheet tab (optional)"
              value={sync.manualSheetName}
              onChange={sync.setManualSheetName}
              mono
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={sync.isTransferring}
              data-testid="mobile-order-sync-tab"
            />
            <p className="mt-2 text-role-caption leading-relaxed text-text-muted">
              Leave blank to read the tab the sheet is on today. Name a tab to
              re-import an older one.
            </p>
          </div>
        ) : (
          <p className="mt-5 text-role-caption text-text-danger">
            You do not have permission to import orders. Ask an admin for
            <span className="font-mono"> orders.import</span>.
          </p>
        )}
      </div>

      {/*
        Sticky floor: the primary verb sits under the thumb, full width, one
        line of label. Demo is the quiet twin beside it — same run surface,
        sample rows, no network and no writes.
      */}
      <footer className="flex shrink-0 flex-col gap-2 border-t border-border-soft px-4 py-4">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!canImportOrders}
          onClick={() => void sync.handleTransfer()}
          data-testid="mobile-order-sync-start"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Sync now
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={demo.start}
          data-testid="mobile-order-sync-demo"
        >
          <Play className="h-4 w-4" aria-hidden />
          Demo sync (sample data)
        </Button>
      </footer>
    </section>
  );
}
