'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { dispatchUsavRefreshData, invalidateDashboardOrderQueries } from '@/lib/dashboard-query-invalidation';
import { streamNdjson } from '@/lib/orders-sync/client';
import type {
  ExceptionsTabState,
  OrderExceptionResolutionDetail,
  SyncPhase,
  TransferOrderDetail,
  TransferOrderDetails,
  TransferTabState,
} from '@/lib/orders-sync/types';
import { landSheetTriageRows } from '@/lib/orders-sync/sheets-inline-triage';
import { applyToShipTriageFacet } from '@/utils/dashboard-search-state';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { TABLE_IMPORT_URL_PARAM } from '@/lib/tables/import/staging-store';

/**
 * The "Import Latest Orders" sync orchestration — Google Sheets + Ecwid Direct
 * imports run in parallel through the connection-driven sync API
 * (`POST /api/integrations/[provider]/sync`, INT-020 — retiring the legacy
 * transfer-orders endpoints for this surface), then the Resolved Exceptions
 * pass streams as NDJSON. Extracted from `DashboardManagementPanel` so the
 * merged Unshipped sidebar's combined Sync/Backfill popover keeps ONE
 * implementation (and one {@link OrderSyncDialog} state surface).
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

export function useOrdersSync() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const openCagedToShipTable = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    applyToShipTriageFacet(params, 'caged');
    params.delete(TABLE_IMPORT_URL_PARAM);
    const qs = params.toString();
    router.replace(qs ? `${SHIPPING_ORDERS_PATH}?${qs}` : SHIPPING_ORDERS_PATH, {
      scroll: false,
    });
  }, [router, searchParams]);
  const [sheetsTask, setSheetsTask] = useState<TransferTabState>({ status: 'idle' });
  const [ecwidTask, setEcwidTask] = useState<TransferTabState>({ status: 'idle' });
  const [exceptionsTask, setExceptionsTask] = useState<ExceptionsTabState>({ status: 'idle' });
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [manualSheetName, setManualSheetName] = useState('');
  const [status, setStatus] = useState<OrdersSyncStatus | null>(null);

  const isTransferring =
    sheetsTask.status === 'running' ||
    ecwidTask.status === 'running' ||
    exceptionsTask.status === 'running';

  const handleCancelTransfer = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    setSheetsTask({ status: 'idle' });
    setEcwidTask({ status: 'idle' });
    setExceptionsTask({ status: 'idle' });
    setStatus({ type: 'error', message: 'Import cancelled' });
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
    setIsSyncDialogOpen(true);
    const t0 = Date.now();
    elapsedRef.current = setInterval(() => setElapsedMs(Date.now() - t0), 100);

    let sheetsResultPayload: Record<string, unknown> | null = null;
    let ecwidResultPayload: Record<string, unknown> | null = null;
    let exceptionsResultPayload: Record<string, unknown> | null = null;
    /** Sheet rows this run put on the triage board, painted once it ends. */
    let landedSheetRows = 0;
    /** Connector `imported` count — details can be empty while inserts landed. */
    let sheetsImported = 0;

    // Fires React Query invalidate + global refresh event so the dashboard
    // tables refetch *as soon as* a stream produces real changes.
    const refreshDashboard = async () => {
      await invalidateDashboardOrderQueries(queryClient);
      dispatchUsavRefreshData();
    };

    // Connection-driven import (INT-020): one POST to the provider's sync API,
    // JSON outcome { ok, imported, updated, error } — no NDJSON stream. The
    // per-tab state keeps the same shape so OrderSyncDialog renders unchanged.
    const runConnectorSync = async (
      provider: 'google_sheets' | 'ecwid',
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
        const res = await fetch(`/api/integrations/${provider}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
          signal: controller.signal,
        });
        data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || data.ok === false) {
          lastError = String(data.error || `HTTP ${res.status}`);
        }
      } catch (err: any) {
        lastError = err?.name === 'AbortError' ? 'Cancelled' : (err?.message || 'Network error');
      }

      const success = !lastError;
      const ins = Number(data.imported ?? 0);
      const upd = Number(data.updated ?? 0);
      if (success && (ins > 0 || upd > 0)) void refreshDashboard();
      const parts = [ins && `${ins} inserted`, upd && `${upd} updated`].filter(Boolean);
      // Render the connector's real per-row detail. This used to be a hardcoded
      // emptyTransferDetails(), so OrderSyncDialog — whose whole body is the
      // inserted/updated/unmatched-catalog lists — drew nothing no matter what
      // the import did. SyncOutcome now carries `details`; fall back to empty
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

      // ── The sheet's rows land on the DESK, not in this dialog ─────────────
      //
      // Google Sheets is a human source: the job already wrote the rows and
      // `autoCageNewOrders` already held the unpaired ones out of the live
      // queue, but until an operator has looked at them nobody has accepted
      // anything. The stacked lists in `OrderSyncDialog` are a receipt, so they
      // stay — they are no longer the only place the rows appear.
      //
      // API connectors (Ecwid here, eBay / Zoho elsewhere) are authorities and
      // deliberately do NOT get a board.
      if (provider === 'google_sheets' && success) {
        sheetsImported += ins;
        const tab = typeof data.tabName === 'string' ? data.tabName.trim() : '';
        const landing = landSheetTriageRows(
          detailsFromSync,
          tab || manualSheetName.trim() || 'Google Sheet',
        );
        if (landing.ok) {
          landedSheetRows += landing.landed;
        } else if (landing.reason === 'file-draft-open') {
          // Refusing is the whole point — a background sync must not delete an
          // operator's half-triaged CSV session. Say so where they are looking.
          parts.push('triage board busy — CSV staging is open');
        }
      }

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
      // Both connectors start together, but the DESK opens on the SHEET alone.
      //
      // Sheet rows are already written when `POST /api/integrations/
      // google_sheets/sync` returns, so waiting for Ecwid (a different
      // marketplace) and then the exceptions matcher before painting them held
      // the operator on a spinner for work that had nothing to do with the rows
      // they asked for. Ecwid and exceptions continue behind the open table and
      // land through the query invalidation `runConnectorSync` already fires.
      const sheetsPromise = runConnectorSync(
        'google_sheets',
        { manualSheetName: manualSheetName.trim() || undefined },
        setSheetsTask,
      );
      const ecwidPromise = runConnectorSync('ecwid', undefined, setEcwidTask);

      const sheetsR = await sheetsPromise;
      sheetsResultPayload = sheetsR.payload;
      if (landedSheetRows > 0 || sheetsImported > 0) {
        setIsSyncDialogOpen(false);
        openCagedToShipTable();
      }

      const ecwidR = await ecwidPromise;
      ecwidResultPayload = ecwidR.payload;

      setExceptionsTask({ status: 'running', phase: 'starting' });
      const exceptionsR = await consumeExceptionsStream('/api/orders-exceptions/sync', {
        method: 'POST',
        signal: controller.signal,
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

      setStatus({
        type: anyFailed ? 'error' : 'success',
        message: parts.length > 0 ? `Orders synced: ${parts.join(', ')}` : 'Orders already up to date',
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

    } catch (_error: any) {
      if (_error?.name === 'AbortError') return;
      setStatus({ type: 'error', message: 'Network error occurred' });
    } finally {
      abortRef.current = null;
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    }
  };

  return {
    sheetsTask,
    ecwidTask,
    exceptionsTask,
    isSyncDialogOpen,
    setIsSyncDialogOpen,
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
