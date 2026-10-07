'use client';

/** Tracking-scan orchestration for the receiving sidebar — the single entry point a scanned tracking #, PO/order reference, or internal… */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  removePendingScanRailRow,
  upsertReceivingRailRows,
} from '@/lib/queries/receiving-queries';
import {
  resolveCachedCarton,
  resolveInternalCode,
  resolveLocalTracking,
  resolveViaLookupPo,
  type CachedCartonResolution,
  type LocalTrackingResolution,
  type ScanResolutionMode,
  type ScanIntakeSurface,
} from '@/lib/receiving/scan';
import {
  applyMatchedCarton,
  applyUnboxCartonOpened,
  applyUnmatchedCarton,
  refocusScanInput,
  showOnArrivalRail,
} from './scan-apply';
import type { ScanApplyCtx, TrackingScanResult } from './scan-types';
import { toast } from '@/lib/toast';
import {
  fetchLinesByTracking,
  resolveReceivingCodeToLine,
  looksLikeReceivingCode,
} from '@/lib/testing/resolve-testing-scan';
import { type UnboxScanMode } from '@/components/sidebar/receiving/ReceivingUnboxScanBar';
import { buildPendingScanRow } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { looksLikeTicketScan } from '@/lib/support/ticket-scan';
import {
  beginUnboxScanVerdict,
  settleUnboxScanVerdict,
} from '@/lib/receiving/unbox-scan-feedback-store';
import { cartonScanVerdict } from '@/lib/receiving/unbox-scan-feedback';

// `ScanResolutionMode` now lives with the scan pipeline (src/lib/receiving/scan) and is re-exported here for the existing import surface.
export type { ScanResolutionMode };
import type {
  PoContext,
  ReceivingMode,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { emitReceiving } from '@/components/receiving/receiving-events';
import type { PhotoRequestPublisher } from '@/components/sidebar/receiving/usePhotoRequestPublisher';
import { useSetting } from '@/hooks/useSettings';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { stageReturnCartonToReturnsTestBin } from '@/lib/receiving/stage-return-to-returns-bin';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { photoStageForScanIntakeSurface } from '@/lib/receiving/photo-intent';
import { cachedLookupUnboxedAt } from '@/lib/receiving/unbox-scan-kind';

// `TrackingScanResult` now lives in `scan-types` (shared with scan-apply);
// re-exported here for the existing import surface (ReceivingSidebarPanel, …).
export type { TrackingScanResult };

/**
 * Fire-and-forget: when a scanned carton is a return intake, stage it into
 * RETURNS-TEST. Never blocks the open path.
 */
function maybeStageReturnCarton(
  receivingId: number | null | undefined,
  row: ReceivingLineRow | null | undefined,
): void {
  if (receivingId == null || receivingId <= 0 || !row) return;
  if (!isReturnIntake(row)) return;
  void stageReturnCartonToReturnsTestBin({ receivingId, row });
}

interface UseTrackingScanArgs {
  staffId: string;
  queryClient: QueryClient;
  publishPhotoRequestFor: PhotoRequestPublisher;
  serialInputRef: React.RefObject<HTMLInputElement | null>;
  // Selection cells (useReceivingSelection)
  setSelectedLine: React.Dispatch<React.SetStateAction<ReceivingLineRow | null>>;
  setScanMatchedRows: React.Dispatch<React.SetStateAction<ReceivingLineRow[]>>;
  setLineAccordionBootstrap: React.Dispatch<React.SetStateAction<'default' | 'all'>>;
  setScanDriven: React.Dispatch<React.SetStateAction<boolean>>;
  // PO-context cells (usePoContext)
  setPoContext: React.Dispatch<React.SetStateAction<PoContext | null>>;
  setArmedLineId: React.Dispatch<React.SetStateAction<number | null>>;
  /** Active sidebar mode — drives UNBOX_SCAN_OPENED stamping when `receive`. */
  receivingMode: ReceivingMode;
}

export interface TrackingScanState {
  bulkTracking: string;
  setBulkTracking: React.Dispatch<React.SetStateAction<string>>;
  /** Armed unbox scan route (null = auto-detect: a value with "-" → Order#). */
  unboxScanMode: UnboxScanMode | null;
  setUnboxScanMode: React.Dispatch<React.SetStateAction<UnboxScanMode | null>>;
  /** >0 while one or more `/api/receiving/lookup-po` lookups are in flight. */
  trackingLookupInFlight: number;
  submitTrackingScan: (
    rawTracking?: string,
    opts?: {
      mode?: ScanResolutionMode;
      onResult?: (result: TrackingScanResult) => void;
      /**
       * Resolve the carton (lookup / cache) and echo `onResult`, but do not
       * open the detail pane, pin a leading row, or prepend feeds. Used by
       * Arrival batch-sort accumulation.
       */
      resolveOnly?: boolean;
    },
  ) => void;
}

/** Flatten every cached receiving feed under `['receiving-lines-table']` (Recent rail, Prioritize, main table) into one de-duplicated row list. */
function collectCachedReceivingRows(queryClient: QueryClient): ReceivingLineRow[] {
  const out: ReceivingLineRow[] = [];
  const seen = new Set<number>();
  const push = (r: unknown) => {
    const row = r as ReceivingLineRow | null;
    if (!row || typeof row.id !== 'number' || seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
  };
  for (const [, data] of queryClient.getQueriesData({ queryKey: ['receiving-lines-table'] })) {
    if (!data) continue;
    if (Array.isArray(data)) {
      data.forEach(push);
      continue;
    }
    const obj = data as { receiving_lines?: unknown; pages?: unknown };
    if (Array.isArray(obj.receiving_lines)) {
      obj.receiving_lines.forEach(push);
    } else if (Array.isArray(obj.pages)) {
      for (const page of obj.pages) {
        if (Array.isArray(page)) page.forEach(push);
        else if (Array.isArray((page as { receiving_lines?: unknown })?.receiving_lines)) {
          (page as { receiving_lines: unknown[] }).receiving_lines.forEach(push);
        }
      }
    }
  }
  return out;
}

export function useTrackingScan({
  staffId,
  queryClient,
  publishPhotoRequestFor,
  serialInputRef,
  setSelectedLine,
  setScanMatchedRows,
  setLineAccordionBootstrap,
  setScanDriven,
  setPoContext,
  setArmedLineId,
  receivingMode,
}: UseTrackingScanArgs): TrackingScanState {
  const [bulkTracking, setBulkTracking] = useState('');
  const [unboxScanMode, setUnboxScanMode] = useState<UnboxScanMode | null>(null);
  const [trackingLookupInFlight, setTrackingLookupInFlight] = useState(0);
  const intakeSurfaceRef = useRef<ScanIntakeSurface>('triage');
  useEffect(() => {
    intakeSurfaceRef.current = receivingMode === 'receive' ? 'unbox' : 'triage';
  }, [receivingMode]);

  // Settings Registry — gate the on-resolve auto-actions. Read into refs so the
  // submitTrackingScan callback identity stays stable (no dep churn / stale
  // closures); defaults preserve the prior always-on behavior while loading.
  const { value: autoFocusSerialPref } = useSetting<boolean>('receiving', 'receiving.autoFocusSerial');
  const { value: autoPushCameraPref } = useSetting<boolean>('receiving', 'receiving.autoPushPhoneCamera');
  const { value: accordionExpandPref } = useSetting<'active' | 'all'>('receiving', 'receiving.accordionExpand');
  const autoFocusSerialRef = useRef(true);
  const autoPushCameraRef = useRef(true);
  const accordionBootstrapRef = useRef<'default' | 'all'>('default');
  useEffect(() => { autoFocusSerialRef.current = autoFocusSerialPref ?? true; }, [autoFocusSerialPref]);
  useEffect(() => { autoPushCameraRef.current = autoPushCameraPref ?? true; }, [autoPushCameraPref]);
  useEffect(() => {
    accordionBootstrapRef.current = accordionExpandPref === 'all' ? 'all' : 'default';
  }, [accordionExpandPref]);

  // Audio/haptic scan confirm (Station archetype §6 — the eyes-down operator needs a non-visual cue).
  const { playScanFeedback } = useScanFeedback();
  const playScanFeedbackRef = useRef(playScanFeedback);
  useEffect(() => { playScanFeedbackRef.current = playScanFeedback; }, [playScanFeedback]);

  // Scan-race guard.
  const scanGenerationRef = useRef(0);
  useEffect(() => {
    const bump = () => {
      scanGenerationRef.current += 1;
    };
    window.addEventListener('receiving-clear-line', bump);
    return () => window.removeEventListener('receiving-clear-line', bump);
  }, []);

  const submitTrackingScan = useCallback(
    (
      rawTracking?: string,
      opts?: {
        mode?: ScanResolutionMode;
        onResult?: (result: TrackingScanResult) => void;
        resolveOnly?: boolean;
      },
    ) => {
      const trackingNumber = (rawTracking ?? bulkTracking).trim();
      if (!trackingNumber) return;

      // Resolve the scan route: an explicit armed mode wins; otherwise `'auto'`
      // lets the server deep-scan ticket#, PO#, and tracking# before creating
      // any carton (no more dash-heuristic misrouting a PO# to Unfound).
      const lookupMode: ScanResolutionMode = opts?.mode ?? 'auto';
      const resolveOnly = opts?.resolveOnly === true;

      // Capture the page-mode generation at submit. `isCurrent()` is checked at
      // every OPEN/SELECT commit below; when false the carton still flows into the
      // queue feed but does not seize the (now different) active view.
      const launchGeneration = scanGenerationRef.current;
      const isCurrent = () => scanGenerationRef.current === launchGeneration;
      const shouldOpen = () => isCurrent() && !resolveOnly;

      // Capture the surface at submit so the loader is tagged to the mode the
      // scan launched in, even if the operator switches modes mid-lookup.
      const scanSurface = intakeSurfaceRef.current;

      // A carrier tracking scan — not a ticket#, internal handle or order#. On
      // Unbox it skips the internal-code rung and is answered by the rail
      // cache first. Every cache key / lookup compares the CANONICAL tracking
      // (IMpb / GS1 label spellings fold onto the stored number).
      const isCarrierTrackingScan =
        lookupMode === 'tracking'
        || (lookupMode === 'auto'
          && !looksLikeTicketScan(trackingNumber)
          && !looksLikeReceivingCode(trackingNumber)
          && !trackingNumber.includes('-'));
      const unboxTrackingScan = scanSurface === 'unbox' && isCarrierTrackingScan;

      // Fire the per-scan audio/haptic confirm alongside the caller's onResult:
      const fireResult = (result: TrackingScanResult) => {
        playScanFeedbackRef.current(result.matched && !result.error ? 'success' : 'reject');
        opts?.onResult?.(result);
      };

      /** Phase 0 hit — open the already-materialized carton in place (zero lookup). */
      const openCachedCarton = (cached: CachedCartonResolution) => {
        fireResult({
          tracking: trackingNumber,
          matched: true,
          po_ids: cached.poIds,
          receiving_id: cached.receivingId,
        });
        if (resolveOnly) {
          emitReceiving('receiving-scan-resolved');
          return;
        }
        if (intakeSurfaceRef.current === 'unbox') {
          settleUnboxScanVerdict(
            trackingNumber,
            cartonScanVerdict(
              collectCachedReceivingRows(queryClient).filter((r) => r.receiving_id === cached.receivingId),
            ),
          );
          // The open chokepoint: a carton already on the Unboxed rail stays put,
          // untouched; touch-scan stamps scanned_by + the unbox-open milestone.
          applyUnboxCartonOpened(queryClient, {
            receivingId: cached.receivingId,
            trackingNumber,
            railRow: cached.row,
            touchScan: { tracking: cached.row.tracking_number ?? trackingNumber },
            unboxedAt: cachedLookupUnboxedAt(cached.row),
          });
        } else {
          void fetch('/api/receiving/touch-scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              receiving_id: cached.receivingId,
              tracking_number: cached.row.tracking_number ?? trackingNumber,
            }),
          }).catch(() => {});
          showOnArrivalRail(queryClient, [cached.row]);
        }
        maybeStageReturnCarton(cached.receivingId, cached.row);
        // Open via the rail's own select event so the sidebar selectedLine, rail highlight, and right-pane workspace stay in lockstep — this is…
        if (shouldOpen()) dispatchSelectLine(cached.row);
        window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));
      };
      const resolveFromCache = (): CachedCartonResolution | null => {
        try {
          return resolveCachedCarton(
            { value: trackingNumber, mode: lookupMode },
            { readCachedRows: () => collectCachedReceivingRows(queryClient) },
          );
        } catch {
          return null; // shape mismatch — fall through to the network rungs
        }
      };

      setBulkTracking('');
      if (unboxTrackingScan && !resolveOnly) beginUnboxScanVerdict(trackingNumber);

      // Unbox carrier scan: the rail cache answers BEFORE anything paints, so a
      // re-scan of a carton already listed opens it in place — no pending row,
      // no reorder, no status change, no lookup.
      if (unboxTrackingScan) {
        const cached = resolveFromCache();
        if (cached) {
          openCachedCarton(cached);
          return;
        }
      }

      const scanStartedAt = Date.now();
      setTrackingLookupInFlight((n) => n + 1);
      // Unbox empty-pane-first on a cache miss: ONE pending row — the openable
      // empty pane, and (for a carrier scan) the rail's pending row under the
      // canonical shipment key, upgraded in place when the carton resolves.
      const pendingRow = scanSurface === 'unbox' && !resolveOnly ? buildPendingScanRow(trackingNumber) : null;
      if (pendingRow) {
        if (unboxTrackingScan) upsertReceivingRailRows(queryClient, [pendingRow]);
        setLineAccordionBootstrap(accordionBootstrapRef.current);
        setSelectedLine(pendingRow);
        setScanDriven(true);
      }
      // Warm the carton editor and the Ticket pane (a linked-ticket scan opens
      // straight onto it). A chunk-load failure here is retried by the real
      // render, so it is swallowed rather than left unhandled.
      if (scanSurface === 'unbox') {
        void import('@/components/receiving/workspace/receiving-line-workspace-loader')
          .then((m) => m.loadReceivingLineWorkspace())
          .catch(() => {});
        void import('@/components/composer/StationTicketPane').catch(() => {});
      }

      // Triage arms the surface-tagged in-flight loader. Unbox uses the real
      // unmatched empty pane as its in-flight display (no Opening skeleton).
      if (scanSurface !== 'unbox' && !resolveOnly) {
        window.dispatchEvent(
          new CustomEvent('receiving-scan-in-flight', {
            detail: { tracking: trackingNumber, startedAt: scanStartedAt, surface: scanSurface },
          }),
        );
      }

      /** Order/ticket miss / hard error: drop the pending row + pane; the header says so. */
      const clearUnboxOptimisticOpen = () => {
        if (scanSurface !== 'unbox') return;
        settleUnboxScanVerdict(trackingNumber, { phase: 'error', receivingId: null, lineCount: 0 });
        if (pendingRow) removePendingScanRailRow(queryClient, pendingRow.client_event_id ?? null);
        if (isCurrent()) {
          setSelectedLine(null);
          setScanDriven(false);
          setScanMatchedRows([]);
        }
      };

      void (async () => {
        try {
          // Serial / unit / carton-handle / receiving-id scan → jump straight to the PO line it belongs to, bypassing carrier tracking intake.
          try {
            // Canonical internal codes — carton/line/unit/handling-unit/repair handles (R-/RCV-/H-/L-/U-/REP-) and printed unit-ids — always resolve…
            const internal = unboxTrackingScan
              ? null
              : await resolveInternalCode(
                  { value: trackingNumber, mode: lookupMode },
                  { looksLikeCode: looksLikeReceivingCode, resolveCode: resolveReceivingCodeToLine },
                );
            if (internal) {
              // Surface split FIRST so an unbox scan never writes triage feeds.
              fireResult({
                tracking: trackingNumber,
                matched: true,
                po_ids: internal.poIds,
                receiving_id: internal.receivingId,
              });
              if (resolveOnly) {
                emitReceiving('receiving-scan-resolved');
                return;
              }
              if (intakeSurfaceRef.current === 'unbox') {
                if (internal.receivingId != null) {
                  applyUnboxCartonOpened(queryClient, {
                    receivingId: internal.receivingId,
                    trackingNumber,
                    railRow: internal.pick ?? null,
                    touchScan: {},
                    unboxedAt: cachedLookupUnboxedAt(internal.pick),
                  });
                }
              } else {
                showOnArrivalRail(queryClient, internal.rows);
              }
              // Echo the resolution back to the caller (phone-paired scans listen for this to render their matched/unmatched result) — the code…
              setScanMatchedRows(internal.rows);
              setLineAccordionBootstrap(accordionBootstrapRef.current);
              setSelectedLine(internal.pick);
              setScanDriven(true);
              maybeStageReturnCarton(internal.receivingId, internal.pick);
              if (internal.via === 'serial') {
                toast.success('Found via serial number', {
                  description: 'Jumped to the PO that received this unit.',
                });
              }
              window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));
              return;
            }
          } catch {
            /* fall through to carrier tracking intake */
          }

          // Phase 0 — Recent-list instant select (zero fetch, no loader). An
          // Unbox carrier scan already asked the cache before painting.
          if (!unboxTrackingScan) {
            const cached = resolveFromCache();
            if (cached) {
              openCachedCarton(cached);
              return;
            }
          }

          // Local-first tracking short-circuit (Triage + Unbox). On a hit, upgrade
          // the optimistic empty pane (Unbox) or open matched (Triage) without
          // waiting on lookup-po. Retarget still rewrites the lookup-po call.
          let lookupValueForCall = trackingNumber;
          let lookupModeForCall: ScanResolutionMode = lookupMode;
          let local: LocalTrackingResolution | null = null;
          try {
            local = await resolveLocalTracking(
              { value: trackingNumber, mode: lookupMode },
              { fetchLinesByTracking },
            );
          } catch {
            /* local miss/error — fall through to lookup-po */
          }
          if (local?.kind === 'local-matched') {
            fireResult({
              tracking: trackingNumber,
              matched: true,
              po_ids: local.poIds,
              receiving_id: local.receivingId,
            });
            if (resolveOnly) {
              emitReceiving('receiving-scan-resolved');
              return;
            }
            if (intakeSurfaceRef.current === 'unbox') {
              settleUnboxScanVerdict(trackingNumber, cartonScanVerdict(local.rows));
              // Client short-circuit skips lookup-po — the open chokepoint lands
              // or keeps the carton row, purges Arrival, and fires touch-scan
              // (scanned_by + unbox-open stamp) in one place.
              applyUnboxCartonOpened(queryClient, {
                receivingId: local.receivingId,
                trackingNumber,
                railRow: local.pick ?? null,
                touchScan: {},
                unboxedAt: cachedLookupUnboxedAt(local.pick),
              });
            } else {
              // Triage re-scan: stamp scanned_by only (no unbox-open semantics).
              void fetch('/api/receiving/touch-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  receiving_id: local.receivingId,
                  tracking_number: trackingNumber,
                }),
              }).catch(() => {});
              showOnArrivalRail(queryClient, local.rows);
            }
            if (shouldOpen()) {
              setScanMatchedRows(local.rows);
              setLineAccordionBootstrap(accordionBootstrapRef.current);
              setSelectedLine(local.pick);
              setScanDriven(true);
              maybeStageReturnCarton(local.receivingId, local.pick);
              if (autoPushCameraRef.current) {
                void publishPhotoRequestFor(
                  local.receivingId,
                  trackingNumber,
                  photoStageForScanIntakeSurface(intakeSurfaceRef.current),
                );
              }
              refocusScanInput({
                intakeSurface: intakeSurfaceRef.current,
                autoFocusSerialRef,
                serialInputRef,
              });
            }
            window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));
            return;
          }
          if (local?.kind === 'retarget') {
            lookupModeForCall = local.mode;
            lookupValueForCall = local.value;
          }

          // Build the apply context once for this scan — every cell the open / promote effects need.
          const applyCtx: ScanApplyCtx = {
            trackingNumber,
            staffId,
            isCurrent,
            onResult: fireResult,
            queryClient,
            publishPhotoRequestFor,
            serialInputRef,
            accordionBootstrapRef,
            autoPushCameraRef,
            autoFocusSerialRef,
            setSelectedLine,
            setScanMatchedRows,
            setLineAccordionBootstrap,
            setScanDriven,
            setPoContext,
            setArmedLineId,
            intakeSurface: intakeSurfaceRef.current,
          };

          // lookup-po rung (local-DB only, src/lib/receiving/scan):
          const resolution = await resolveViaLookupPo(
            {
              callValue: lookupValueForCall,
              callMode: lookupModeForCall,
              originalMode: lookupMode,
              staffId: Number(staffId),
              intakeSurface: intakeSurfaceRef.current,
            },
            {
              lookupPo: async (body) => {
                const r = await fetch('/api/receiving/lookup-po', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...body,
                    intakeSurface: intakeSurfaceRef.current,
                  }),
                });
                return r.json();
              },
            },
          );
          const data = resolution.data;

          // The PO header matched but its line items could not import because the
          // Zoho integration isn't connected — surface the real cause and route
          // the operator to reconnect (else it reads as a misleading "No PO found").
          if (resolution.kind === 'integration-error') {
            clearUnboxOptimisticOpen();
            fireResult({
              tracking: trackingNumber,
              matched: false,
              po_ids: Array.isArray(data.po_ids) ? (data.po_ids as string[]) : [],
              receiving_id: Number(data.receiving_id) || undefined,
            });
            window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));
            toast.error('Inventory system not connected — PO matched but items could not load. Reconnect it in Settings → Integrations.');
            return;
          }

          // Order# lookups that resolve to nothing report a clean not-found —
          // surface a toast instead of falling into the unmatched-carton flow
          // (a mistyped PO/order number must not create a phantom box).
          if (resolution.kind === 'not_found') {
            clearUnboxOptimisticOpen();
            fireResult({ tracking: trackingNumber, matched: false, po_ids: [] });
            window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));
            toast.error(
              (typeof data?.error === 'string' ? data.error : '') || `No PO found for “${trackingNumber}”`,
            );
            return;
          }

          if (resolution.kind === 'matched') {
            if (resolveOnly) {
              fireResult({
                tracking: trackingNumber,
                matched: true,
                po_ids: Array.isArray(data.po_ids) ? (data.po_ids as string[]) : [],
                receiving_id: Number(data.receiving_id) || undefined,
              });
              emitReceiving('receiving-scan-resolved');
              return;
            }
            applyMatchedCarton(applyCtx, data);
          } else {
            if (resolveOnly) {
              fireResult({
                tracking: trackingNumber,
                matched: false,
                po_ids: Array.isArray(data.po_ids) ? (data.po_ids as string[]) : [],
                receiving_id: Number(data.receiving_id) || undefined,
              });
              emitReceiving('receiving-scan-resolved');
              return;
            }
            applyUnmatchedCarton(applyCtx, data);
          }
        } catch (err) {
          clearUnboxOptimisticOpen();
          const message = err instanceof Error ? err.message : 'Network error';
          fireResult({
            tracking: trackingNumber,
            matched: false,
            po_ids: [],
            error: message,
          });
          window.dispatchEvent(new CustomEvent('receiving-scan-resolved'));
          toast.error(message);
        } finally {
          setTrackingLookupInFlight((n) => Math.max(0, n - 1));
        }
      })();
    },
    [
      bulkTracking,
      staffId,
      queryClient,
      publishPhotoRequestFor,
      serialInputRef,
      setSelectedLine,
      setScanMatchedRows,
      setLineAccordionBootstrap,
      setScanDriven,
      setPoContext,
      setArmedLineId,
    ],
  );

  return {
    bulkTracking,
    setBulkTracking,
    unboxScanMode,
    setUnboxScanMode,
    trackingLookupInFlight,
    submitTrackingScan,
  };
}
