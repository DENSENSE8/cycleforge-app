'use client';

/**
 * Mobile picker — `/m/pick/[orderId]`
 *
 * Order-specific picker screen. Loads tasks from
 * `/api/orders/:id/pick-tasks`, opens a session via `/api/picking/session`,
 * and drives each action through the typed picking endpoints.
 *
 * Reached by tapping a card on the `/m/pick` queue landing, or by scanning
 * an order QR that resolves to this route via `mobileQrUrl()`.
 *
 * Design principles (see plan B0):
 *   - One thumb, one goal — primary action in the bottom dock.
 *   - Status before form — top strip shows order + progress + connection.
 *   - Optimistic + reconciling — UI advances on tap; failures roll back with a visible error.
 *
 * Thin composition shell: the session state machine lives in
 * {@link useMobilePicker}; the task card + status shells are presentational
 * components under `./_picker/`.
 */

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { NetworkChip } from '@/components/mobile/NetworkChip';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { ProgressDots } from '@/components/mobile/ProgressDots';
import { ConfirmDock } from '@/components/mobile/ConfirmDock';
import { ShortPickSheet } from '@/components/mobile/picker/ShortPickSheet';
import { useMobilePicker } from './_picker/useMobilePicker';
import { PickerTaskCard } from './_picker/PickerTaskCard';
import { LoadingShell, ErrorShell, EmptyShell, CompleteCard } from './_picker/PickerShells';

export default function MobilePickerPage() {
  return (
    <Suspense fallback={<LoadingShell label="Loading picker…" />}>
      <PickerInner />
    </Suspense>
  );
}

function PickerInner() {
  const router = useRouter();
  const c = useMobilePicker();
  const {
    isLoaded, user, order, loadError, currentIndex,
    shortSheetOpen, setShortSheetOpen, confirming,
    detailsExpanded, setDetailsExpanded, scanError, scanner,
    currentTask, totalTasks, doneCount, allDone,
    handleConfirmPick, handleShortPick, handleScanDecode,
  } = c;

  // ── Render gates
  if (!isLoaded || !user) return null;
  if (loadError) return <ErrorShell error={loadError} onBack={() => router.push('/m/pick')} />;
  // Chrome first: an order that has not resolved still needs the back button and
  // the SCAN corner, or a bad deep link is a dead end.
  if (!order) {
    return (
      <div className="flex h-full flex-col bg-surface-canvas">
        <MobileDetailTopBar backHref="/m/pick" subtitle="Order" title="Loading…" />
        <LoadingShell label="Loading tasks…" />
      </div>
    );
  }
  if (totalTasks === 0) return <EmptyShell onBack={() => router.push('/m/pick')} />;

  // ── Render
  // The session page hides the bottom nav (HIDDEN_PREFIXES match in
  // MobileBottomNav), so the layout's scroll container is full viewport.
  // h-full fills it exactly — single scroll context lives inside <main>,
  // and the ConfirmDock anchors to the viewport bottom as a flex sibling.
  return (
    <div className="flex h-full flex-col bg-surface-canvas">
      {/* ─── Status strip ──────────────────────────────────────────────── */}
      <MobileDetailTopBar
        backHref="/m/pick"
        lead={
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-sm font-semibold text-text-default">
            {order.customerInitials}
          </span>
        }
        subtitle="Order"
        title={order.orderLabel}
        right={
          <>
            <ProgressDots done={doneCount} total={totalTasks} />
            <NetworkChip compact />
          </>
        }
      />

      {/* ─── Task content ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {allDone || !currentTask ? (
          <CompleteCard onBack={() => router.push('/m/pick')} />
        ) : (
          <PickerTaskCard
            currentTask={currentTask}
            scanner={scanner}
            onDecode={handleScanDecode}
            scanError={scanError}
            detailsExpanded={detailsExpanded}
            onToggleDetails={() => setDetailsExpanded((v) => !v)}
          />
        )}
      </main>

      {/* ─── Bottom dock ───────────────────────────────────────────────── */}
      {!allDone && currentTask && (
        <ConfirmDock
          label={
            currentIndex >= totalTasks - 1
              ? `Confirm pick · ${doneCount + 1}/${totalTasks}`
              : 'Confirm pick'
          }
          onConfirm={() => void handleConfirmPick()}
          loading={confirming}
          tone={currentIndex >= totalTasks - 1 ? 'success' : 'primary'}
          secondary={{
            label: 'Short pick…',
            onPress: () => setShortSheetOpen(true),
          }}
        />
      )}

      {/* ─── Short pick sheet ─────────────────────────────────────────── */}
      {currentTask && (
        <ShortPickSheet
          open={shortSheetOpen}
          onClose={() => setShortSheetOpen(false)}
          pickedQty={0}
          plannedQty={currentTask.plannedQty}
          productLabel={`${currentTask.productTitle ?? currentTask.sku} · ${currentTask.sku}`}
          onConfirm={(r) => void handleShortPick(r)}
        />
      )}
    </div>
  );
}
