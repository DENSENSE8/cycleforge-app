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
import { qk } from '@/queries/keys';
import {
  fetchOrderSyncSources,
  ORDER_SYNC_SOURCES_STALE_MS,
  type OrderSyncSource,
} from '@/lib/integrations/order-sync-sources-client';

/** The "Import Latest Orders" sync orchestration — ShipStation, the org's ONE order import, through the connection-driven sync API (`POST… */
interface OrdersSyncStatus {
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

/** Narrow the connector's opaque `SyncOutcome.details` to TransferOrderDetails. */
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

/** How long the outcome stays readable. */
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
  // `isSyncDialogOpen` is GONE (2026-09-15).
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

  /** The operator acknowledged the result — drop the ledger so whatever surface yielded its stage (the desk table, the `/m` screen) comes back. */
  const dismissRun = useCallback(() => {
    runRef.current = null;
    setRun(null);
  }, []);

  // The run ledger is the whole truth once it exists: a sheet-only or
  // platform-only run never flips the ShipStation task to running.
  const isTransferring =
    shipStationTask.status === 'running' ||
    exceptionsTask.status === 'running' ||
    (run !== null && !run.settled);

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

  /**
   * Sync every linked platform in pipeline order (`/m/orders/sync`): ShipStation
   * imports, the Google Sheets backup fills blanks and adds what ShipStation
   * never saw, any other linked channel syncs after, and the exceptions pass
   * runs last against what they landed.
   */
  const handleTransfer = async () => {
    // One run at a time.
    if (abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus(null);
    setElapsedMs(0);

    let sources: OrderSyncSource[] = [];
    try {
      sources = await queryClient.fetchQuery({
        queryKey: qk.orderSyncSources,
        queryFn: fetchOrderSyncSources,
        staleTime: ORDER_SYNC_SOURCES_STALE_MS,
      });
    } catch {
      // The list is a convenience; ShipStation below is still the floor.
    }
    const selected = sources.filter((source) => source.canSync);
    // No list (fetch failed / nothing linked yet) → the order import of record.
    const runShipStation = selected.some((s) => s.provider === 'shipstation') || sources.length === 0;
    const sheetSource = selected.find((s) => s.provider === 'google_sheets');
    const platformSources = selected.filter((s) => s.provider !== 'shipstation' && s.provider !== 'google_sheets');

    setShipStationTask(
      runShipStation ? { status: 'running', details: emptyTransferDetails() } : { status: 'idle', summary: 'Not selected' },
    );
    // Exceptions sync runs AFTER the platforms finish so that rows just
    // inserted are visible to the matcher. Keep it idle/queued until then.
    setExceptionsTask({ status: 'idle', summary: 'Queued' });
    const lanes: SyncRunLane[] = [
      ...(runShipStation ? (['shipstation'] as const) : []),
      ...(sheetSource ? (['google_sheets'] as const) : []),
      ...(platformSources.length > 0 ? (['platforms'] as const) : []),
      'exceptions',
    ];
    const freshRun = createSyncRun(lanes);
    runRef.current = freshRun;
    setRun(freshRun);
    const t0 = Date.now();
    elapsedRef.current = setInterval(() => setElapsedMs(Date.now() - t0), 100);
    // Where the run REPORTS itself (rewritten 2026-09-15).
    // The toast stays OUTCOME-ONLY (operator 2026-09-14). The run surface is

    let shipStationResultPayload: Record<string, unknown> | null = null;
    let exceptionsResultPayload: Record<string, unknown> | null = null;

    // Fires React Query invalidate + global refresh event so the dashboard
    // tables refetch *as soon as* a stream produces real changes.
    const refreshDashboard = async () => {
      await invalidateDashboardOrderQueries(queryClient);
      dispatchUsavRefreshData();
    };

    // Connection-driven import (INT-020):
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
      // Render the connector's real per-row detail.
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

    /** Google Sheets backup: backfills orders (fill blanks) and inserts the ones nobody has. */
    const runSheetSync = async (): Promise<{ imported: number; updated: number; ambiguous: number; error?: string }> => {
      let data: Record<string, unknown> = {};
      let lastError: string | undefined;
      try {
        await streamNdjson(
          '/api/integrations/google_sheets/sync',
          { method: 'POST', headers: { Accept: NDJSON_ACCEPT }, signal: controller.signal },
          {
            onBatch: (events) => {
              foldRun('google_sheets', events);
              for (const event of events) {
                if (event.type === 'result') data = event.result;
                else if (event.type === 'error') lastError = readStreamError(event.error);
              }
            },
          },
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        lastError = err instanceof Error ? err.message : 'Network error';
      }
      if (!lastError && data.ok === false) lastError = String(data.error || 'Failed');
      completeRunLane('google_sheets', { ok: !lastError, error: lastError });
      const imported = Number(data.imported ?? 0);
      const updated = Number(data.updated ?? 0);
      if (imported > 0 || updated > 0) void refreshDashboard();
      const ambiguous = Number((data.stats as Record<string, number> | undefined)?.ambiguous ?? 0);
      return { imported, updated, ambiguous, error: lastError };
    };

    /** Every other linked channel, one after another (each is its own round trip). */
    const runPlatformSyncs = async (): Promise<{ imported: number; failures: string[] }> => {
      let imported = 0;
      const failures: string[] = [];
      for (const source of platformSources) {
        const res = await fetch(`/api/integrations/${source.provider}/sync`, {
          method: 'POST',
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; imported?: number; updated?: number };
        if (!res.ok || data.ok === false) failures.push(`${source.label.replace(/^Sync /, '')}: ${data.error || 'failed'}`);
        else imported += Number(data.imported ?? 0) + Number(data.updated ?? 0);
        foldRun('platforms', [{ type: 'phase', phase: 'syncing_platforms', count: 1 }]);
      }
      completeRunLane('platforms', { ok: failures.length === 0, error: failures[0] });
      if (imported > 0) void refreshDashboard();
      return { imported, failures };
    };

    try {
      const shipStationR: { payload: Record<string, unknown> | null; error?: string } = runShipStation
        ? await runShipStationSync()
        : { payload: null };
      shipStationResultPayload = shipStationR.payload;
      const sheetR = sheetSource ? await runSheetSync() : null;
      const platformsR = platformSources.length > 0 ? await runPlatformSyncs() : null;

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

      const totalInserted = Number(shipStationResultPayload?.insertedOrders || 0) + (platformsR?.imported ?? 0);
      const totalUpdated = Number(shipStationResultPayload?.updatedOrdersFields || 0);
      const totalTracking = Number(shipStationResultPayload?.updatedOrdersTracking || 0);
      const totalUnresolved = Number(shipStationResultPayload?.unresolvedTrackingCount || 0);
      const exceptionsResolved = Number(exceptionsResultPayload?.matched || 0);

      await invalidateDashboardOrderQueries(queryClient);
      dispatchUsavRefreshData();

      const anyFailed =
        [shipStationR, exceptionsR].some((r) => Boolean(r.error) || r.payload?.success === false) ||
        Boolean(sheetR?.error) ||
        (platformsR?.failures.length ?? 0) > 0;
      const parts = [];
      if (totalInserted > 0) parts.push(`${totalInserted} inserted`);
      if (totalUpdated > 0) parts.push(`${totalUpdated} updated${totalTracking ? ` (${totalTracking} tracking)` : ''}`);
      if (sheetR && sheetR.imported + sheetR.updated > 0) {
        parts.push(`Google Sheets ${sheetR.imported} inserted, ${sheetR.updated} backfilled`);
      }
      if (totalUnresolved > 0) parts.push(`⚠ ${totalUnresolved} tracking not recognized`);
      if (sheetR && sheetR.ambiguous > 0) parts.push(`⚠ ${sheetR.ambiguous} sheet orders on two platforms`);

      // Rows that arrived but resolved no exception still count as work done;
      // an import that inserted nothing and fixed nothing is "already up to
      // date", which is a DIFFERENT sentence and must not be dressed as a win.
      const summary =
        parts.length > 0 ? `Orders synced: ${parts.join(', ')}` : 'Orders already up to date';

      setStatus({
        type: anyFailed ? 'error' : 'success',
        message: summary,
        details: {
          inserted: totalInserted + (sheetR?.imported ?? 0),
          updated: totalUpdated + (sheetR?.updated ?? 0),
          trackingAttached: totalTracking,
          unresolvedTracking: totalUnresolved,
          processedRows: Number(shipStationResultPayload?.processedRows || 0),
          exceptionsResolved,
          durationMs: Date.now() - t0,
        },
      });

      // The failing case names the step that failed rather than a generic "sync failed" — ShipStation can land while the exceptions pass does not.
      // **Both carry an explicit duration + close button (operator 2026-09-14:
      if (anyFailed) {
        const failures = [
          shipStationR.error && `ShipStation: ${shipStationR.error}`,
          sheetR?.error && `Google Sheets: ${sheetR.error}`,
          ...(platformsR?.failures ?? []),
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

  /** The run's per-row record, published once nothing is still in flight. */
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
