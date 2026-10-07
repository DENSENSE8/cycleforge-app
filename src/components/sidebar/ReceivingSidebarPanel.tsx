'use client';

/** Receiving sidebar — thin composition layer. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { useStationTheme } from '@/hooks/useStationTheme';
import {
  safeChannelName,
  getPhoneBridgeChannelName,
  getStaffStationBridgeChannelName,
} from '@/lib/realtime/channels';

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { ReceivingReturnBanner } from '@/components/sidebar/ReceivingReturnBanner';
import { ReceivingLinePicker } from '@/components/sidebar/receiving/ReceivingLinePicker';
import { ReceivingRailBody } from '@/components/sidebar/receiving/ReceivingRailBody';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';

import { TriageScanBand, UnboxScanBand, PickupScanBand } from '@/components/sidebar/receiving/ReceivingScanBands';
import {
  isScanPreview,
  setScanStance,
  useScanModeRelease,
} from '@/components/station/scan-bar';
import { useUnboxPreviewOpen } from '@/components/sidebar/receiving/useUnboxPreviewOpen';
import type { PickupLine, PickupOrderGroup } from '@/lib/receiving/pickup/pickup-lines';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { resolvePickupScan } from '@/lib/local-pickup/resolve-pickup-scan';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useReceivingMode } from '@/components/sidebar/receiving/useReceivingMode';
import { usePoContext } from '@/components/sidebar/receiving/usePoContext';
import { useReceivingReturnsBanner } from '@/components/sidebar/receiving/useReceivingReturnsBanner';
import { useReceivingSourcePlatform } from '@/components/sidebar/receiving/useReceivingSourcePlatform';
import { useReceivingSelection } from '@/components/sidebar/receiving/useReceivingSelection';
import { useReceivingLineNavigation } from '@/components/sidebar/receiving/useReceivingLineNavigation';
import { useReceivingWorkspaceBridge } from '@/components/sidebar/receiving/useReceivingWorkspaceBridge';
import { useTrackingScan } from '@/components/sidebar/receiving/useTrackingScan';
import { usePhoneScanBridge } from '@/components/sidebar/receiving/usePhoneScanBridge';
import { usePhotoRequestPublisher } from '@/components/sidebar/receiving/usePhotoRequestPublisher';
import { useArrivalBatchSortSession } from '@/components/sidebar/receiving/useArrivalBatchSortSession';
import { ArrivalBatchCaptureStrip } from '@/components/sidebar/receiving/ArrivalBatchCaptureStrip';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { classifyArrivalScan } from '@/lib/receiving/arrival-command-routing';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import { toast } from '@/lib/toast';

export function ReceivingSidebarPanel() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Identity is server-derived (the proxy redirects unauthenticated traffic to
  // /signin), so `user` is non-null whenever this sidebar renders.
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const staffIdNum = user?.staffId ?? 0;
  const staffId = String(staffIdNum);
  const { theme: themeColor } = useStationTheme({ staffId: staffIdNum });

  // ── Realtime channels + photo-request publisher ──────────────────────────
  const { getClient: getAblyClient } = useAblyClient();
  const phoneChannelName = safeChannelName(() => getPhoneBridgeChannelName(orgId!, staffIdNum));
  const stationChannelName = safeChannelName(() =>
    getStaffStationBridgeChannelName(orgId!, staffIdNum),
  );
  const publishPhotoRequestFor = usePhotoRequestPublisher({
    staffIdNum,
    getAblyClient,
    stationChannelName,
  });

  // ── Mode / sub-view (URL-backed) ─────────────────────────────────────────
  const {
    mode,
    unboxView,
    updateUnboxView,
  } = useReceivingMode();

  // ── Unbox session:
  const { poContext, setPoContext, setArmedLineId, clearPoContext } = usePoContext();
  const { serialInputRef, returns, dismissReturn } = useReceivingReturnsBanner();

  // Source-platform mirror — called for its `receiving-package-updated` event
  // bridge side effect (the returned setter is owned by the line inspector).
  useReceivingSourcePlatform({ poContext, setPoContext });

  // Clearing a scan session drops the PO context. (It also used to reset the
  // sidebar's serial input; that input never existed on this surface — see
  // `useReceivingReturnsBanner`.)
  const clearScanSession = clearPoContext;

  // ── Selection + navigation + right-pane bridge ───────────────────────────
  const {
    selectedLine,
    setSelectedLine,
    scanMatchedRows,
    setScanMatchedRows,
    lineAccordionBootstrap,
    setLineAccordionBootstrap,
    scanDriven,
    setScanDriven,
    recordView,
    preview,
  } = useReceivingSelection({ mode, clearScanSession });

  const { currentIndex, canPrev, canNext } = useReceivingLineNavigation({
    selectedLine,
    scanMatchedRows,
    setSelectedLine,
    setScanMatchedRows,
    setLineAccordionBootstrap,
  });

  useReceivingWorkspaceBridge({
    mode,
    selectedLine,
    lineAccordionBootstrap,
    scanDriven,
    recordView,
    preview,
    scanMatchedRows,
    currentIndex,
    canPrev,
    canNext,
  });

  // Preview stance: resolve + open the station READ-ONLY (two reads, no
  // writes). Unbox is the golden; sibling stations adopt the same hook rather
  // than a page-local twin.
  const openUnboxPreview = useUnboxPreviewOpen();

  // ── Triage scan input (scan-only — NOT a list filter) ──
  const [triageQuery, setTriageQuery] = useState('');
  /** Local Pickup scan wedge — open/match an LCPU order (not create). */
  const [pickupScanQuery, setPickupScanQuery] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  const submitPickupScan = useCallback(() => {
    const raw = pickupScanQuery.trim();
    if (!raw) return;

    const rail =
      queryClient.getQueryData<PickupOrderGroup[]>(['local-pickup-orders-rail']) ?? [];
    let matchables = (Array.isArray(rail) ? rail : []).map((g) => ({
      orderId: g.orderId,
      poNumber: g.poNumber,
      customer: g.customer,
      referenceNumber: null as string | null,
    }));

    if (matchables.length === 0) {
      const lines = queryClient.getQueryData<PickupLine[]>(['local-pickup-lines']) ?? [];
      const byOrder = new Map<
        number,
        {
          orderId: number;
          poNumber: string;
          customer: string | null;
          referenceNumber: string | null;
        }
      >();
      for (const line of Array.isArray(lines) ? lines : []) {
        if (byOrder.has(line.order_id)) continue;
        byOrder.set(line.order_id, {
          orderId: line.order_id,
          poNumber: line.po_number || line.reference_number || `Order ${line.order_id}`,
          customer: line.customer_name,
          referenceNumber: line.reference_number,
        });
      }
      matchables = [...byOrder.values()];
    }

    const orderId = resolvePickupScan(raw, matchables);
    setPickupScanQuery('');
    if (orderId == null) {
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.set('lcpu', String(orderId));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  }, [pickupScanQuery, queryClient, searchParams, router, pathname]);

  // ── Tracking scan (+ phone-paired bridge) ────────────────────────────────
  const {
    bulkTracking,
    setBulkTracking,
    unboxScanMode,
    setUnboxScanMode,
    submitTrackingScan,
  } = useTrackingScan({
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
    receivingMode: mode,
  });

  const releaseUnboxScanMode = useCallback(() => setUnboxScanMode(null), [setUnboxScanMode]);
  useScanModeRelease(unboxScanMode != null, releaseUnboxScanMode);

  usePhoneScanBridge({
    phoneChannelName,
    stationChannelName,
    getAblyClient,
    staffId,
    submitTrackingScan,
  });

  // Arrival batch-sort session (CMD-BATCH-SORT) — session-only; leaves triage / reload clears.
  const batchSort = useArrivalBatchSortSession(mode === 'triage');

  const findCachedRowByReceivingId = useCallback(
    (receivingId: number): ReceivingLineRow | null => {
      for (const [, data] of queryClient.getQueriesData({ queryKey: ['receiving-lines-table'] })) {
        const rows: ReceivingLineRow[] = [];
        if (Array.isArray(data)) {
          rows.push(...(data as ReceivingLineRow[]));
        } else if (data && typeof data === 'object') {
          const obj = data as { receiving_lines?: unknown; pages?: unknown };
          if (Array.isArray(obj.receiving_lines)) {
            rows.push(...(obj.receiving_lines as ReceivingLineRow[]));
          } else if (Array.isArray(obj.pages)) {
            for (const page of obj.pages) {
              if (Array.isArray(page)) rows.push(...(page as ReceivingLineRow[]));
              else if (Array.isArray((page as { receiving_lines?: unknown })?.receiving_lines)) {
                rows.push(...((page as { receiving_lines: ReceivingLineRow[] }).receiving_lines));
              }
            }
          }
        }
        const hit = rows.find((r) => r.receiving_id === receivingId);
        if (hit) return hit;
      }
      return null;
    },
    [queryClient],
  );

  const submitTriageScan = useCallback(() => {
    const raw = triageQuery.trim();
    if (!raw) return;
    setTriageQuery('');

    const classified = classifyArrivalScan(raw, batchSort.mode);

    if (classified.kind === 'command') {
      if (classified.command === 'batch_sort') batchSort.enterBatchSort();
      else batchSort.exitToDefault();
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      return;
    }

    if (classified.kind === 'location') {
      void batchSort.commitBatchToLocation(classified.locationBarcode!);
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      return;
    }

    if (batchSort.isBatchSort) {
      submitTrackingScan(classified.raw, {
        mode: 'tracking',
        resolveOnly: true,
        onResult: (result) => {
          if (!result.matched || result.receiving_id == null) {
            toast.error(result.error || `No carton for “${classified.raw}”`);
            return;
          }
          const row = findCachedRowByReceivingId(result.receiving_id);
          batchSort.pushResolved({
            tracking: result.tracking,
            receivingId: result.receiving_id,
            label: (row?.tracking_number || result.tracking).trim() || result.tracking,
            isReturn: row ? isReturnIntake(row) : false,
            isPriority: !!row?.is_priority,
            priorityLane: row?.priority_lane ?? null,
          });
        },
      });
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      return;
    }

    submitTrackingScan(classified.raw, { mode: 'tracking' });
  }, [
    triageQuery,
    batchSort,
    submitTrackingScan,
    findCachedRowByReceivingId,
  ]);

  // Procedure → ingest hand-back.
  useReceivingEvents({
    /** Leaving a preview returns the bench to Scan with an empty bar. */
    'receiving-workspace-close': () => {
      if (!isScanPreview()) return;
      setScanStance('scan');
      setBulkTracking('');
      setPickupScanQuery('');
      emitReceiving('receiving-focus-scan');
    },
    'receiving-submit-tracking': ({ tracking }) => {
      const raw = String(tracking ?? '').trim();
      // Gated to Arrival: the only mounted procedure waist that hands back
      // today. Unbox's dock keeps its own submit meaning per step.
      if (!raw || mode !== 'triage') return;
      submitTrackingScan(raw, { mode: 'tracking' });
    },
  });

  // External focus trigger — Quick Access chips dispatch `receiving-focus-scan` after navigating so the input is hot even when the panel was…
  useEffect(() => {
    const handler = () =>
      requestAnimationFrame(() => {
        if (
          document.querySelector('[data-unbox-dock-scan]') ||
          document.querySelector('[data-unbox-serial-dock]') ||
          document.querySelector('[data-arrival-dock-scan]')
        ) {
          return;
        }
        const el = scanInputRef.current;
        if (!el) return;
        el.focus();
        el.select();
      });
    window.addEventListener('receiving-focus-scan', handler);
    return () => window.removeEventListener('receiving-focus-scan', handler);
  }, []);

  // The focus-scan quick-key is now the app-wide shared hotkey (default Insert, reassignable via the gear in any StationScanBar).

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
        {/* L2 Mode + Recents live in GlobalHeader house-wide
            (HeaderPageSwitcher). Do not remount ReceivingModeSwitcher. */}

        {mode === 'incoming' ? (
          // Inbound desk is rail-less (Pattern E).
          null
        ) : mode === 'repair' ? (
          // Repair desk is rail-less too (`railless:
          null
        ) : mode === 'pickup' ? (
          // Local Pickup — station scan bar only. Order rows stay in the table.
          // Selecting an order writes `?lcpu=` to highlight products in the table.
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PickupScanBand
              themeColor={themeColor}
              value={pickupScanQuery}
              onChange={setPickupScanQuery}
              onSubmit={submitPickupScan}
              inputRef={scanInputRef}
              staffId={staffId}
            />
          </div>
        ) : mode === 'history' ? (
          // History has no scan session and no rail — the right-pane table is
          // filtered via URL params instead. The returns banner still rides here.
          <ReceivingReturnBanner returns={returns} onDismiss={dismissReturn} />
        ) : (
          // Scan surfaces (Unbox / Triage): scan bar pinned at the top of the
          // station card, alerts and the recents feed beneath it.
          <>
            {mode === 'triage' ? (
              // Triage is a scan surface: tracking-only entry with optional
              // CMD-BATCH-SORT session capture. Default submit → lookup-po;
              // batch mode accumulates then commits staging on a shelf scan.
              <>
                <TriageScanBand
                  themeColor={themeColor}
                  value={triageQuery}
                  onChange={setTriageQuery}
                  onSubmit={submitTriageScan}
                  inputRef={scanInputRef}
                  staffId={staffId}
                  // Triage no longer spins the scan bar either — its loading state is the right-pane TriageWorkspaceSkeleton (surface-tagged), matching Unbox.
                  isResolving={batchSort.committing}
                  batchSortArmed={batchSort.isBatchSort}
                  batchCount={batchSort.batch.length}
                />
                <ArrivalBatchCaptureStrip
                  batch={batchSort.batch}
                  onRemove={batchSort.removeOne}
                />
              </>
            ) : (
              <UnboxScanBand
                themeColor={themeColor}
                value={bulkTracking}
                onChange={setBulkTracking}
                previewLookup={(raw, m) => openUnboxPreview(raw, m)}
                onSubmit={(m) => {
                  // Preview stance resolves + opens READ-ONLY through the
                  // bar's own `previewLookup`; the ingest path (which writes,
                  // stamps and records) must not run.
                  if (isScanPreview()) return;
                  // Unbox: one cache upsert on resolve (final title). No importing
                  // stub — that caused tracking# → Unfound PO flicker.
                  // Leaving Queue after a scan lands on the default tab.
                  if (unboxView === 'queue') updateUnboxView('history', { clearLine: false });
                  submitTrackingScan(undefined, { mode: m });
                }}
                inputRef={scanInputRef}
                // Unbox no longer spins the scan bar on a tracking scan. Loading
                // is the right-pane optimistic unmatched empty PO-items open
                // (settle remount), not the Unbox loading field / Opening chrome.
                isResolving={false}
                staffId={staffId}
                armedMode={unboxScanMode}
                onToggleMode={(m) => setUnboxScanMode((prev) => (prev === m ? null : m))}
              />
            )}

            <ReceivingReturnBanner returns={returns} onDismiss={dismissReturn} />

            {/* Multi-match picker — above the rail so it stays visible. */}
            {scanDriven && !selectedLine && scanMatchedRows.length > 1 ? (
              <ReceivingLinePicker
                rows={scanMatchedRows}
                onPick={(line) => {
                  setLineAccordionBootstrap('default');
                  setSelectedLine(line);
                }}
                onCancel={() => {
                  setScanDriven(false);
                  setScanMatchedRows([]);
                  clearScanSession();
                }}
              />
            ) : null}

            <SidebarRailScrollport>
              <ReceivingRailBody mode={mode} selectedLine={selectedLine} />
            </SidebarRailScrollport>

          </>
        )}
    </div>
  );
}
