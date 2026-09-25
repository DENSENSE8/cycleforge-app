'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dispatchUsavRefreshData, invalidateDashboardOrderQueries } from '@/lib/dashboard-query-invalidation';
import { toast } from '@/lib/toast';
import { streamNdjson } from '@/lib/orders-sync/client';
import type {
  ExceptionsTabState,
  OrderExceptionResolutionDetail,
  SyncPhase,
  SyncStreamEvent,
  TransferOrderDetail,
  TransferOrderDetails,
  TransferTabState,
} from '@/lib/orders-sync/types';
import {
  applySyncRunEvent,
  cancelSyncRun,
  completeSyncRunLane,
  createSyncRun,
  type SyncRunLane,
  type SyncRunState,
} from '@/lib/orders-sync/run-steps';
import { buildSyncRunDetail } from '@/lib/orders-sync/run-detail';

/**
 * The "Import Latest Orders" sync orchestration — ShipStation, the org's ONE
 * order import, through the connection-driven sync API
 * (`POST /api/integrations/shipstation/sync`, INT-020), then the Resolved
 * Exceptions pass streams as NDJSON. There is no source switch: an org without
 * live ShipStation keys sees the ShipStation route's own error as the lane
 * error. This is the ONE order-import implementation on any surface: the desk
 * CTA over the table, `/m/orders/sync`, and the chrome popover all drive this
 * hook. The rival copy — `useOrdersImport` behind the dashboard sidebar's
 * import card, with its own state, its own numbers and the legacy NDJSON
 * routes — was deleted with that unreachable card (2026-09-15).
 */
export interface OrdersSyncStatus {
  type: 'success' | 'error';
  message: string;
  details?: {
    inserted?: number;
    updated?: number;
    trackingAttached?: number;
    unresolvedTracking?: number;
    processedRows?: number;
    exceptionsResolved?: number;
    durationMs?: number;
  };
}

function phaseSummary(phase: SyncPhase, count?: number): string {
  switch (phase) {
    case 'starting': return 'Starting…';
    case 'fetching_shipstation': return 'Fetching ShipStation orders…';
    case 'resolving_tracking': return count ? `Resolving ${count} tracking number${count === 1 ? '' : 's'}…` : 'Resolving tracking…';
    case 'inserting': return count ? `Inserting ${count} order${count === 1 ? '' : 's'}…` : 'Inserting…';
    case 'updating': return count ? `Updating ${count} order${count === 1 ? '' : 's'}…` : 'Updating…';
    case 'publishing': return 'Publishing changes…';
    case 'scanning_exceptions': return count ? `Scanning ${count} open exception${count === 1 ? '' : 's'}…` : 'Scanning exceptions…';
    case 'done': return 'Done';
    default: return 'Working…';
  }
}

function emptyTransferDetails(): TransferOrderDetails {
  return { inserted: [], updated: [], deleted: [], unknownTitle: [], unresolvedTracking: [], unmatchedCatalog: [] };
}

/**
 * Narrow the connector's opaque `SyncOutcome.details` to TransferOrderDetails.
 *
 * The field crosses an HTTP boundary as untyped JSON and is typed `unknown` on
 * the contract (it is provider-shaped by design), so every bucket is checked
 * for being an array rather than trusted. A provider that sends no detail — or
 * a malformed one — degrades to empty lists instead of throwing inside a
 * setState and taking the dialog down with it.
 */
function coerceTransferDetails(value: unknown): TransferOrderDetails {
  const empty = emptyTransferDetails();
  if (!value || typeof value !== 'object') return empty;
  const src = value as Record<string, unknown>;
  const bucket = (key: keyof TransferOrderDetails): TransferOrderDetail[] =>
    Array.isArray(src[key]) ? (src[key] as TransferOrderDetail[]) : [];
  return {
    inserted: bucket('inserted'),
    updated: bucket('updated'),
    deleted: bucket('deleted'),
    unknownTitle: bucket('unknownTitle'),
    unresolvedTracking: bucket('unresolvedTracking'),
    unmatchedCatalog: bucket('unmatchedCatalog'),
    quarantined: bucket('quarantined'),
  };
}

/**
 * One stable toast per import, so a repeat run REPLACES its own last result
 * rather than stacking two contradictory sentences.
 */
const SYNC_TOAST_ID = 'orders-sync';

/**
 * How long the outcome stays readable. The house `success` default is 2.2s —
 * right for an inline edit whose paint IS the feedback, wrong for a batch that
 * runs about a minute: the operator is not watching the corner when it lands.
 * Twelve seconds plus a close button survives a glance away without becoming
 * furniture.
 */
const SYNC_TOAST_MS = 12_000;
/**
 * Asking for the ledger. Without it the route answers with one JSON object at
 * the end of the run (Settings' shape) and every phase is lost.
 */
const NDJSON_ACCEPT = 'application/x-ndjson';

/**
 * A transport failure arrives as the response BODY, which for this route is
 * JSON (`{"error":"PLAN_LIMIT"}`, `{"error":"FORBIDDEN"}`). Printing the raw
 * envelope in the operator's error line is not a sentence; lift the field.
 */
function readStreamError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return trimmed || 'Failed';
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    const detail = parsed.error ?? parsed.message;
    return typeof detail === 'string' ? detail : trimmed;
  } catch {
    return trimmed;
  }
}

export function useOrdersSync() {
  const queryClient = useQueryClient();
  const [shipStationTask, setShipStationTask] = useState<TransferTabState>({ status: 'idle' });
  const [exceptionsTask, setExceptionsTask] = useState<ExceptionsTabState>({ status: 'idle' });
  // `isSyncDialogOpen` is GONE (2026-09-15). The coupling it encoded was this
  // hook DRIVING a panel no surface showed: the flag existed to open the rail
  // leaf's copy of the progress panel, and with that leaf deleted this hook's
  // only progress surface is `run` → OrderSyncRunView. That panel
  // (`OrderSyncDialog`) and the sidebar card's duplicate hook are deleted too,
  // so there is no second progress surface left for a flag to open.
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<OrdersSyncStatus | null>(null);
  /**
   * The measured run ledger. Held in a ref as well as state because the
   * stream folds into it batch by batch: reading `run` from the closure would
   * let a later batch overwrite an earlier one.
   */
  const runRef = useRef<SyncRunState | null>(null);
  const [run, setRun] = useState<SyncRunState | null>(null);

  const foldRun = useCallback((lane: SyncRunLane, events: SyncStreamEvent[]) => {
    const base = runRef.current;
    if (!base) return;
    let next = base;
    for (const event of events) next = applySyncRunEvent(next, lane, event);
    runRef.current = next;
    setRun(next);
  }, []);

  const completeRunLane = useCallback(
    (lane: SyncRunLane, outcome: { ok: boolean; error?: string }) => {
      const base = runRef.current;
      if (!base) return;
      const next = completeSyncRunLane(base, lane, outcome);
      runRef.current = next;
      setRun(next);
    },
    [],
  );

  /**
   * The operator acknowledged the result — drop the ledger so whatever surface
   * yielded its stage (the desk table, the `/m` screen) comes back. The run
   * deliberately has NO auto-dismiss: a 60-second import that reports itself
   * for 2.2 seconds and vanishes is the bug this whole surface replaces.
   */
  const dismissRun = useCallback(() => {
    runRef.current = null;
    setRun(null);
  }, []);

  const isTransferring =
    shipStationTask.status === 'running' || exceptionsTask.status === 'running';

  const handleCancelTransfer = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearInterval(elapsedRef.current ?? undefined);
    setShipStationTask({ status: 'idle' });
    setExceptionsTask({ status: 'idle' });
    setStatus({ type: 'error', message: 'Import cancelled' });
    // The ledger KEEPS what already landed. Wiping the three tasks to idle
    // above is the panel's own reset; throwing away "20 orders were inserted
    // before you cancelled" would hide the one fact the operator needs next.
    if (runRef.current) {
      const next = cancelSyncRun(runRef.current);
      runRef.current = next;
      setRun(next);
    }
    toast.info('Order import cancelled', { id: SYNC_TOAST_ID });
  };

  const handleTransfer = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setShipStationTask({ status: 'running', details: emptyTransferDetails() });
    // Exceptions sync runs AFTER ShipStation finishes so that rows just
    // inserted are visible to the matcher. Keep it idle/queued until then.
    setExceptionsTask({ status: 'idle', summary: 'Queued' });
    setStatus(null);
    setElapsedMs(0);
    const freshRun = createSyncRun(['shipstation', 'exceptions']);
    runRef.current = freshRun;
    setRun(freshRun);
    const t0 = Date.now();
    elapsedRef.current = setInterval(() => setElapsedMs(Date.now() - t0), 100);
    // Where the run REPORTS itself (rewritten 2026-09-15).
    //
    // This used to describe a spinner: the desk CTA read only `isTransferring`,
    // the per-row lists lived in a rail leaf the desk no longer opened, and a
    // 58-second import that inserted 35 orders reported itself as a spinner
    // that stopped. That is fixed upstream of here — `run` is a measured
    // ledger (`run-steps.ts`) that `OrderSyncRunView` paints on the desk stage
    // and on `/m/orders/sync`, and `runDetail` answers "which rows".
    //
    // The toast stays OUTCOME-ONLY (operator 2026-09-14). The run surface is
    // the progress affordance; a second spinner parked in the corner for a
    // minute says nothing it is not already saying, and a toast that cannot be
    // dismissed while it waits is chrome, not feedback. `@/lib/toast` fires
    // once, when there is something to report — for the operator who navigated
    // away from the run.

    let shipStationResultPayload: Record<string, unknown> | null = null;
    let exceptionsResultPayload: Record<string, unknown> | null = null;

    // Fires React Query invalidate + global refresh event so the dashboard
    // tables refetch *as soon as* a stream produces real changes.
    const refreshDashboard = async () => {
      await invalidateDashboardOrderQueries(queryClient);
      dispatchUsavRefreshData();
    };

    // Connection-driven import (INT-020): one POST to ShipStation's sync API.
    // `Accept: application/x-ndjson` makes that POST STREAM — every phase and
    // per-row detail as it happens — and the terminal `result` line carries the
    // same SyncOutcome the JSON form returns, so the task state below is built
    // from exactly the payload it always was.
    const runShipStationSync = async (): Promise<{
      payload: Record<string, unknown> | null;
      error?: string;
    }> => {
      setShipStationTask({
        status: 'running',
        summary: 'Syncing…',
        phase: 'starting',
        details: emptyTransferDetails(),
      } as TransferTabState);

      let data: Record<string, unknown> = {};
      let lastError: string | undefined;
      try {
        await streamNdjson(
          '/api/integrations/shipstation/sync',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: NDJSON_ACCEPT },
            body: '{}',
            signal: controller.signal,
          },
          {
            onBatch: (events) => {
              foldRun('shipstation', events);
              let lastPhase: { phase: SyncPhase; count?: number } | undefined;
              for (const event of events) {
                if (event.type === 'phase') {
                  lastPhase = { phase: event.phase, count: event.count };
                } else if (event.type === 'result') {
                  data = event.result;
                } else if (event.type === 'error') {
                  lastError = readStreamError(event.error);
                }
              }
              if (!lastPhase) return;
              const phase = lastPhase;
              setShipStationTask((prev) => ({
                ...prev,
                status: 'running',
                phase: phase.phase,
                summary: phaseSummary(phase.phase, phase.count),
              }));
            },
          },
        );
      } catch (err: unknown) {
        const aborted = err instanceof Error && err.name === 'AbortError';
        lastError = aborted ? 'Cancelled' : err instanceof Error ? err.message : 'Network error';
      }
      if (!lastError && data.ok === false) {
        lastError = String(data.error || 'Failed');
      }

      const success = !lastError;
      const ins = Number(data.imported ?? 0);
      const upd = Number(data.updated ?? 0);
      if (success && (ins > 0 || upd > 0)) void refreshDashboard();
      const parts = [ins && `${ins} inserted`, upd && `${upd} updated`].filter(Boolean);
      // Render the connector's real per-row detail. This used to be a hardcoded
      // emptyTransferDetails(), so the per-row inserted/updated/unmatched-catalog
      // lists drew nothing no matter what the import did — first in the deleted
      // `OrderSyncDialog`, now in `runDetail` → OrderSyncRunDetailSheet.
      // SyncOutcome now carries `details`; fall back to empty only when the
      // connector genuinely sends none.
      const detailsFromSync = coerceTransferDetails(data.details);

      const stats = (data.stats ?? {}) as Record<string, number>;

      completeRunLane('shipstation', { ok: success, error: lastError });

      setShipStationTask({
        status: success ? 'done' : 'error',
        summary: success
          ? (parts.length > 0 ? (parts.join(', ') as string) : 'Up to date')
          : lastError || 'Failed',
        error: success ? undefined : lastError || 'Failed',
        details: detailsFromSync,
        stats,
        inserted: ins,
        updated: upd,
        phase: 'done',
      } as TransferTabState);
      // Legacy payload keys so the roll-up summary math below stays unchanged.
      return {
        payload: success
          ? { success: true, insertedOrders: ins, updatedOrdersFields: upd }
          : { success: false, error: lastError },
        error: lastError,
      };
    };

    const consumeExceptionsStream = async (
      url: string,
      init: RequestInit,
    ): Promise<{ payload: Record<string, unknown> | null; error?: string }> => {
      const resolved: OrderExceptionResolutionDetail[] = [];
      const stillOpen: OrderExceptionResolutionDetail[] = [];
      let payload: Record<string, unknown> | null = null;
      let lastError: string | undefined;

      try {
        await streamNdjson(url, init, {
          onBatch: (events) => {
            foldRun('exceptions', events);
            let lastPhase: { phase: SyncPhase; count?: number } | undefined;
            let rowsChanged = false;
            for (const event of events) {
              if (event.type === 'phase') {
                lastPhase = { phase: event.phase, count: event.count };
              } else if (event.type === 'exception') {
                if (event.kind === 'resolved') {
                  resolved.push(event.row);
                } else {
                  stillOpen.push(event.row);
                }
                rowsChanged = true;
              } else if (event.type === 'result') {
                payload = event.result;
                if (resolved.length > 0) void refreshDashboard();
              } else if (event.type === 'error') {
                lastError = event.error;
              }
            }
            if (!lastPhase && !rowsChanged) return;
            setExceptionsTask((prev) => ({
              ...prev,
              status: 'running',
              summary: lastPhase
                ? phaseSummary(lastPhase.phase, lastPhase.count)
                : prev.summary,
              phase: lastPhase?.phase ?? prev.phase,
              resolved: [...resolved],
              stillOpen: [...stillOpen],
              matched: resolved.length,
              scanned: resolved.length + stillOpen.length,
            }));
          },
        });
      } catch (err: any) {
        lastError = err?.name === 'AbortError' ? 'Cancelled' : (err?.message || 'Network error');
      }

      const data = payload ?? {};
      const success = !lastError && (data as any).success !== false;
      const matched = Number((data as any).matched ?? resolved.length);
      setExceptionsTask({
        status: success ? 'done' : 'error',
        summary: success
          ? (matched > 0 ? `${matched} resolved` : 'None pending')
          : (lastError || (data as any).error || 'Failed'),
        error: success ? undefined : (lastError || (data as any).error || 'Failed'),
        resolved: [...resolved],
        stillOpen: [...stillOpen],
        scanned: Number((data as any).scanned ?? (resolved.length + stillOpen.length)),
        matched,
        phase: 'done',
      });
      return { payload: data, error: lastError };
    };

    try {
      const shipStationR = await runShipStationSync();
      shipStationResultPayload = shipStationR.payload;

      setExceptionsTask({ status: 'running', phase: 'starting' });
      const exceptionsR = await consumeExceptionsStream('/api/orders-exceptions/sync', {
        method: 'POST',
        signal: controller.signal,
      });
      const exceptionsPayload = exceptionsR.payload;
      const exceptionsFailed =
        exceptionsPayload !== null &&
        'success' in exceptionsPayload &&
        exceptionsPayload.success === false;
      completeRunLane('exceptions', {
        ok: !exceptionsR.error && !exceptionsFailed,
        error: exceptionsR.error,
      });
      exceptionsResultPayload = exceptionsR.payload;

      const totalInserted = Number(shipStationResultPayload?.insertedOrders || 0);
      const totalUpdated = Number(shipStationResultPayload?.updatedOrdersFields || 0);
      const totalTracking = Number(shipStationResultPayload?.updatedOrdersTracking || 0);
      const totalUnresolved = Number(shipStationResultPayload?.unresolvedTrackingCount || 0);
      const exceptionsResolved = Number(exceptionsResultPayload?.matched || 0);

      await invalidateDashboardOrderQueries(queryClient);
      dispatchUsavRefreshData();

      const anyFailed = [shipStationR, exceptionsR].some(
        (r) => Boolean(r.error) || (r.payload && (r.payload as any).success === false),
      );
      const parts = [];
      if (totalInserted > 0) parts.push(`${totalInserted} inserted`);
      if (totalUpdated > 0) parts.push(`${totalUpdated} updated${totalTracking ? ` (${totalTracking} tracking)` : ''}`);
      if (totalUnresolved > 0) parts.push(`⚠ ${totalUnresolved} tracking not recognized`);

      // Rows that arrived but resolved no exception still count as work done;
      // an import that inserted nothing and fixed nothing is "already up to
      // date", which is a DIFFERENT sentence and must not be dressed as a win.
      const summary =
        parts.length > 0 ? `Orders synced: ${parts.join(', ')}` : 'Orders already up to date';

      setStatus({
        type: anyFailed ? 'error' : 'success',
        message: summary,
        details: {
          inserted: totalInserted,
          updated: totalUpdated,
          trackingAttached: totalTracking,
          unresolvedTracking: totalUnresolved,
          processedRows: Number(shipStationResultPayload?.processedRows || 0),
          exceptionsResolved,
          durationMs: Date.now() - t0,
        },
      });

      // The failing case names the step that failed rather than a generic
      // "sync failed" — ShipStation can land while the exceptions pass does
      // not.
      //
      // **Both carry an explicit duration + close button (operator 2026-09-14:
      // "toast not displaying").** It WAS displaying — for 2.2s
      // (`TOAST_DURATION.success`, tuned for an inline edit that paints
      // instantly). This import runs ~60s, so the operator clicks, looks away,
      // and the one sentence reporting 35 imported orders blinks and is gone
      // while they are still looking at the queue. A default meant for "your
      // edit saved" cannot report a minute-long batch job; `toast-theme.ts`
      // says call sites that need longer pass their own.
      if (anyFailed) {
        const failures = [
          shipStationR.error && `ShipStation: ${shipStationR.error}`,
          exceptionsR.error && `Exceptions: ${exceptionsR.error}`,
        ].filter(Boolean);
        toast.error(failures.length > 0 ? failures.join(' · ') : summary, {
          id: SYNC_TOAST_ID,
          duration: SYNC_TOAST_MS,
        });
      } else {
        toast.success(summary, {
          id: SYNC_TOAST_ID,
          duration: SYNC_TOAST_MS,
          closeButton: true,
        });
      }
    } catch (error: unknown) {
      // An abort is the operator's own Cancel — `handleCancelTransfer` already
      // set the state and said so; re-reporting it as a failure would be a lie.
      if (error instanceof Error && error.name === 'AbortError') return;
      setStatus({ type: 'error', message: 'Network error occurred' });
      toast.error('Could not import orders — network error', { id: SYNC_TOAST_ID });
    } finally {
      abortRef.current = null;
      clearInterval(elapsedRef.current ?? undefined);
    }
  };

  /**
   * The run's per-row record, published once nothing is still in flight.
   *
   * Mid-run the provider lists are partial by construction (a lane streams its
   * detail as it goes), and a list that grows while the operator reads it is
   * worse than no list.
   */
  const runDetail = useMemo(
    () =>
      run && !isTransferring
        ? buildSyncRunDetail(shipStationTask)
        : null,
    [isTransferring, run, shipStationTask],
  );

  return {
    run,
    runDetail,
    dismissRun,
    elapsedMs,
    isTransferring,
    status,
    setStatus,
    handleTransfer,
    handleCancelTransfer,
  };
}
