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
 * The "Import Latest Orders" sync orchestration — Google Sheets + Ecwid Direct
 * imports run in parallel through the connection-driven sync API
 * (`POST /api/integrations/[provider]/sync`, INT-020 — retiring the legacy
 * transfer-orders endpoints for this surface), then the Resolved Exceptions
 * pass streams as NDJSON. This is the ONE order-import implementation on any
 * surface: the desk CTA over the table, `/m/orders/sync`, and the chrome
 * popover all drive this hook. The rival copy — `useOrdersImport` behind the
 * dashboard sidebar's import card, with its own state, its own numbers and the
 * legacy NDJSON routes — was deleted with that unreachable card (2026-09-15).
 */
export interface OrdersSyncStatus {
  type: 'success' | 'error';
  message: string;
  details?: {
    tabName?: string;
    inserted?: number;
    updated?: number;
    trackingAttached?: number;
    unresolvedTracking?: number;
    processedRows?: number;
    exceptionsResolved?: number;
    ecwidInserted?: number;
    durationMs?: number;
  };
}

function phaseSummary(phase: SyncPhase, count?: number): string {
  switch (phase) {
    case 'starting': return 'Starting…';
    case 'fetching_sheet': return 'Fetching sheet…';
    case 'fetching_ecwid': return 'Fetching Ecwid orders…';
    case 'resolving_tracking': return count ? `Resolving ${count} tracking number${count === 1 ? '' : 's'}…` : 'Resolving tracking…';
    case 'matching_orders': return 'Matching orders…';
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
  // Scoped to the TransferOrderDetail-shaped buckets. `skippedRows` holds a
  // different row type and is narrowed separately below — a single generic
  // helper over every key would widen the return to the union of both.
  type DetailBucket = Exclude<keyof TransferOrderDetails, 'skippedRows' | 'recoveredRows'>;
  const bucket = (key: DetailBucket): TransferOrderDetail[] =>
    Array.isArray(src[key]) ? (src[key] as TransferOrderDetail[]) : [];
  return {
    inserted: bucket('inserted'),
    updated: bucket('updated'),
    deleted: bucket('deleted'),
    unknownTitle: bucket('unknownTitle'),
    unresolvedTracking: bucket('unresolvedTracking'),
    unmatchedCatalog: bucket('unmatchedCatalog'),
    skippedRows: Array.isArray(src.skippedRows)
      ? (src.skippedRows as TransferOrderDetails['skippedRows'])
      : [],
    recoveredRows: Array.isArray(src.recoveredRows)
      ? (src.recoveredRows as TransferOrderDetails['recoveredRows'])
      : [],
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
  const [sheetsTask, setSheetsTask] = useState<TransferTabState>({ status: 'idle' });
  const [ecwidTask, setEcwidTask] = useState<TransferTabState>({ status: 'idle' });
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
  const [manualSheetName, setManualSheetName] = useState('');
  const [status, setStatus] = useState<OrdersSyncStatus | null>(null);
  /**
   * The measured run ledger. Held in a ref as well as state because two lanes
   * fold into it concurrently: reading `run` from the closure would let the
   * Ecwid lane's fold overwrite the sheet lane's.
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
    (lane: SyncRunLane, outcome: { ok: boolean; error?: string; tabName?: string }) => {
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
    sheetsTask.status === 'running' ||
    ecwidTask.status === 'running' ||
    exceptionsTask.status === 'running';

  const handleCancelTransfer = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearInterval(elapsedRef.current ?? undefined);
    setSheetsTask({ status: 'idle' });
    setEcwidTask({ status: 'idle' });
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
    setSheetsTask({ status: 'running', details: emptyTransferDetails() });
    setEcwidTask({ status: 'running', details: emptyTransferDetails() });
    // Exceptions sync runs AFTER sheets+ecwid finish so that rows just inserted
    // are visible to the matcher. Keep it idle/queued until then.
    setExceptionsTask({ status: 'idle', summary: 'Queued' });
    setStatus(null);
    setElapsedMs(0);
    const freshRun = createSyncRun(['sheets', 'ecwid', 'exceptions']);
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

    let sheetsResultPayload: Record<string, unknown> | null = null;
    let ecwidResultPayload: Record<string, unknown> | null = null;
    let exceptionsResultPayload: Record<string, unknown> | null = null;

    // Fires React Query invalidate + global refresh event so the dashboard
    // tables refetch *as soon as* a stream produces real changes.
    const refreshDashboard = async () => {
      await invalidateDashboardOrderQueries(queryClient);
      dispatchUsavRefreshData();
    };

    // Connection-driven import (INT-020): one POST to the provider's sync API.
    // `Accept: application/x-ndjson` makes that POST STREAM — every phase and
    // per-row detail as it happens — and the terminal `result` line carries the
    // same SyncOutcome the JSON form returns, so the per-tab state below is
    // built from exactly the payload it always was.
    const runConnectorSync = async (
      provider: 'google_sheets' | 'ecwid',
      lane: SyncRunLane,
      body: Record<string, unknown> | undefined,
      setter: typeof setSheetsTask,
    ): Promise<{ payload: Record<string, unknown> | null; error?: string }> => {
      setter({
        status: 'running',
        summary: 'Syncing…',
        phase: 'starting',
        details: emptyTransferDetails(),
      } as TransferTabState);

      let data: Record<string, unknown> = {};
      let lastError: string | undefined;
      try {
        await streamNdjson(
          `/api/integrations/${provider}/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: NDJSON_ACCEPT },
            body: JSON.stringify(body ?? {}),
            signal: controller.signal,
          },
          {
            onBatch: (events) => {
              foldRun(lane, events);
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
              setter((prev) => ({
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
      // SyncOutcome now carries `details`; fall back to empty
      // only for a provider that genuinely sends none.
      const detailsFromSync = coerceTransferDetails(data.details);

      // Surface the skip breakdown in the summary. Without it, "every row was
      // skipped for a blank Item Number" and "the sheet is already imported"
      // both read as a bare "Up to date", which is the single most misleading
      // thing this panel can say.
      const stats = (data.stats ?? {}) as Record<string, number>;
      const skipped =
        (stats.skippedNoItemNumber ?? 0) +
        (stats.skippedNoTracking ?? 0) +
        (stats.skippedNoOrderId ?? 0);
      // "needs a fix", not "skipped": this counts only the ACTIONABLE reasons,
      // while the panel header counts every listed skip. Two different numbers
      // under one word ("11 skipped" beside "21 rows skipped") reads as a bug.
      if (skipped > 0) parts.push(`${skipped} need${skipped === 1 ? 's' : ''} a fix`);

      completeRunLane(lane, {
        ok: success,
        error: lastError,
        tabName: typeof data.tabName === 'string' ? data.tabName : undefined,
      });

      setter({
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
      const [sheetsR, ecwidR] = await Promise.all([
        runConnectorSync(
          'google_sheets',
          'sheets',
          { manualSheetName: manualSheetName.trim() || undefined },
          setSheetsTask,
        ),
        runConnectorSync('ecwid', 'ecwid', undefined, setEcwidTask),
      ]);
      sheetsResultPayload = sheetsR.payload;
      ecwidResultPayload = ecwidR.payload;

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

      const totalInserted = Number(sheetsResultPayload?.insertedOrders || 0)
        + Number(ecwidResultPayload?.insertedOrders || 0);
      const totalUpdated = Number(sheetsResultPayload?.updatedOrdersFields || 0)
        + Number(ecwidResultPayload?.updatedOrdersFields || 0);
      const totalTracking = Number(sheetsResultPayload?.updatedOrdersTracking || 0)
        + Number(ecwidResultPayload?.updatedOrdersTracking || 0);
      const totalUnresolved = Number(sheetsResultPayload?.unresolvedTrackingCount || 0)
        + Number(ecwidResultPayload?.unresolvedTrackingCount || 0);
      const exceptionsResolved = Number(exceptionsResultPayload?.matched || 0);

      await invalidateDashboardOrderQueries(queryClient);
      dispatchUsavRefreshData();

      const anyFailed = [sheetsR, ecwidR, exceptionsR].some(
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
          tabName: sheetsResultPayload?.tabName as string | undefined,
          inserted: totalInserted,
          updated: totalUpdated,
          trackingAttached: totalTracking,
          unresolvedTracking: totalUnresolved,
          processedRows: Number(sheetsResultPayload?.processedRows || 0)
            + Number(ecwidResultPayload?.processedRows || 0),
          exceptionsResolved,
          ecwidInserted: Number(ecwidResultPayload?.insertedOrders || 0),
          durationMs: Date.now() - t0,
        },
      });

      // The failing case names the provider that failed rather than a generic
      // "sync failed" — the sheet and Ecwid run in parallel and one can land
      // while the other does not.
      //
      // **Both carry an explicit duration + close button (operator 2026-09-14:
      // "toast not displaying").** It WAS displaying — for 2.2s
      // (`TOAST_DURATION.success`, tuned for an inline edit that paints
      // instantly). This import runs ~60s, so the operator clicks, looks away,
      // and the one sentence reporting 35 imported orders blinks and is gone
      // while they are still looking at the sheet. A default meant for "your
      // edit saved" cannot report a minute-long batch job; `toast-theme.ts`
      // says call sites that need longer pass their own.
      if (anyFailed) {
        const failures = [
          sheetsR.error && `Google Sheet: ${sheetsR.error}`,
          ecwidR.error && `Ecwid: ${ecwidR.error}`,
          exceptionsR.error && `Exceptions: ${exceptionsR.error}`,
        ].filter(Boolean);
        toast.error(failures.length > 0 ? failures.join(' · ') : summary, {
          id: SYNC_TOAST_ID,
          duration: SYNC_TOAST_MS,
        });
      } else if (sheetsResultPayload?.missingPriceColumn === true) {
        // A run that imports rows but no revenue is a SUCCESS the operator must
        // still act on: the header match is exact, so `Item Price` or
        // `Sale Price (USD)` binds nothing and every row lands with a null sale
        // amount. Silence here is how 4467 orders accumulated 6 prices.
        toast.warning(
          `${summary} — but the sheet has no price column, so no sale amounts were imported. Title a column "Sale Price".`,
          // No `closeButton` — `toast.warning` already forces one.
          { id: SYNC_TOAST_ID, duration: SYNC_TOAST_MS },
        );
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
        ? buildSyncRunDetail({ sheets: sheetsTask, ecwid: ecwidTask })
        : null,
    [ecwidTask, isTransferring, run, sheetsTask],
  );

  return {
    sheetsTask,
    ecwidTask,
    exceptionsTask,
    run,
    runDetail,
    dismissRun,
    elapsedMs,
    isTransferring,
    manualSheetName,
    setManualSheetName,
    status,
    setStatus,
    handleTransfer,
    handleCancelTransfer,
  };
}
