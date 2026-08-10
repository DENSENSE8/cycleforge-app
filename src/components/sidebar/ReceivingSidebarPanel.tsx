'use client';

/**
 * Receiving sidebar — thin composition layer.
 *
 * All business logic lives in focused hooks under `./receiving/`:
 *   - useReceivingMode .............. URL ⇄ mode + Unbox sub-view + nav
 *   - usePoContext .................. active carton + armed line
 *   - useReceivingReturnsBanner ..... returns banner + shared serial input ref
 *   - useReceivingSourcePlatform .... source-platform mirror (side effect)
 *   - useReceivingSelection ........ selected line + inbound event bridges
 *   - useReceivingLineNavigation ... sibling-line nav + progress
 *   - useReceivingWorkspaceBridge .. outbound right-pane workspace dispatch
 *   - useTrackingScan .............. the tracking/PO/handle scan orchestration
 *   - usePhoneScanBridge ........... phone-paired scan round-trip
 *   - usePhotoRequestPublisher ..... nudge the paired phone's camera open
 *   - useRailEditMode .............. pencil bulk-select + bulk delete
 *
 * The render is pure composition of presentational subcomponents. Nothing here
 * fetches, mutates, or computes — it only wires hooks to UI.
 */

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

import { RailEditModeProvider } from '@/components/sidebar/rail-edit-mode';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { buildPendingScanStubRow } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { TrackingScanResult } from '@/components/sidebar/receiving/useTrackingScan';
import { ReceivingReturnBanner } from '@/components/sidebar/ReceivingReturnBanner';
import { ReceivingLinePicker } from '@/components/sidebar/receiving/ReceivingLinePicker';
import { IncomingSidebarPanel } from '@/components/sidebar/receiving/IncomingSidebarPanel';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';

import { TriageScanBand, UnboxScanBand, PickupScanBand } from '@/components/sidebar/receiving/ReceivingScanBands';
import { TriageCartonSearchBar } from '@/components/sidebar/receiving/TriageCartonSearchBar';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { ReceivingRailBody } from '@/components/sidebar/receiving/ReceivingRailBody';
import { ReceivingRecentRailFilters } from '@/components/sidebar/rail-shell/ReceivingRecentRailFilters';
import { useReceivingRailFacets } from '@/components/sidebar/rail-shell/useReceivingRailFacets';
import {
  EMPTY_PICKUP_RAIL_FACETS,
  PickupRailFilters,
  type PickupRailFacets,
} from '@/components/sidebar/rail-shell/PickupRailFilters';
import { ReceivingBulkActionBar } from '@/components/sidebar/receiving/ReceivingBulkActionBar';
import { RepairSidebarPanel } from '@/components/sidebar/RepairSidebarPanel';
import { PickupSidebarRail } from '@/components/receiving/pickup/PickupSidebarRail';
import type { PickupLine, PickupOrderGroup } from '@/components/receiving/pickup/pickup-lines';
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
import { useRailEditMode } from '@/components/sidebar/receiving/useRailEditMode';
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
    triageQuery: triageListQuery,
    isScanSurface,
    updateUnboxView,
    updateTriageQuery,
  } = useReceivingMode();

  // ── Unbox session: PO context + returns banner ───────────────────────────
  // `armedLineId` (the value) is deliberately not read here — it is consumed by
  // the scan pipeline (`usePoContext` / `scan-apply` / `useTrackingScan`), which
  // this panel only feeds the setter to.
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
    scanMatchedRows,
    currentIndex,
    canPrev,
    canNext,
  });

  // ── Triage scan input (scan-only — NOT a list filter) ──
  const [triageQuery, setTriageQuery] = useState('');
  /** Pre-resolve row pinned at the top of the Triage list (tracking # title). */
  const [triageLeadingRow, setTriageLeadingRow] = useState<ReceivingLineRow | null>(null);
  /** Client-side Unboxed / Triage rail text filter + shared facet SoT. */
  const [unboxRailFilter, setUnboxRailFilter] = useState('');
  const receivingRailFacets = useReceivingRailFacets();
  /** Local Pickup scan wedge — open/match an LCPU order (not create). */
  const [pickupScanQuery, setPickupScanQuery] = useState('');
  const [pickupRailFilter, setPickupRailFilter] = useState('');
  const [pickupRailFacets, setPickupRailFacets] = useState<PickupRailFacets>(
    EMPTY_PICKUP_RAIL_FACETS,
  );
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== 'triage') setTriageLeadingRow(null);
  }, [mode]);

  const onTriageScanStart = useCallback((tracking: string) => {
    setTriageLeadingRow(buildPendingScanStubRow(tracking));
  }, []);

  const onTriageScanResult = useCallback((_result: TrackingScanResult) => {
    setTriageLeadingRow(null);
  }, []);

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
    selectedLine,
    scanMatchedRows,
    setSelectedLine,
    setScanMatchedRows,
    setLineAccordionBootstrap,
    setScanDriven,
    setPoContext,
    setArmedLineId,
    receivingMode: mode,
    onTriageScanStart,
  });

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

    submitTrackingScan(classified.raw, {
      mode: 'tracking',
      onResult: onTriageScanResult,
    });
  }, [
    triageQuery,
    batchSort,
    submitTrackingScan,
    findCachedRowByReceivingId,
    onTriageScanResult,
  ]);

  // Procedure → ingest hand-back. The Arrival staging dock owns shelf scans on
  // the open carton; a payload it does not own is a tracking, and it lands here
  // rather than being swallowed at the dock. Only this direction is legal —
  // this bar never places cartons.
  useReceivingEvents({
    'receiving-submit-tracking': ({ tracking }) => {
      const raw = String(tracking ?? '').trim();
      // Gated to Arrival: the only mounted procedure waist that hands back
      // today. Unbox's dock keeps its own submit meaning per step.
      if (!raw || mode !== 'triage') return;
      submitTrackingScan(raw, { mode: 'tracking', onResult: onTriageScanResult });
    },
  });

  // ── Rail edit mode (pencil bulk select / dismiss) — Unbox Unboxed dock +
  // thin combined Triage rail. Right-pane workbench Select is table multi-select
  // (separate); the sidebar pencil dismisses rows from this staffer's rail.
  const {
    railEditMode,
    railSelectedIds,
    railSelectedIdList,
    railBulkDismissing,
    toggleRailEditMode,
    toggleRailSelected,
    setManyRailSelected,
    handleRailBulkDismiss,
  } = useRailEditMode({
    isScanSurface,
    mode,
    unboxView,
    triageView: 'triage',
  });

  // External focus trigger — Quick Access chips dispatch `receiving-focus-scan`
  // after navigating so the input is hot even when the panel was already mounted.
  // Select any existing text so the operator can immediately overwrite it with
  // the next scan (barcode guns type-then-Enter, so a selected field is "armed").
  // When a station PROCEDURE waist is mounted — Unbox dock scan entry (any
  // step), the legacy serial marker, or the Arrival staging dock — that field
  // owns the wedge; do not steal back to sidebar ingestion. This bar stays the
  // ingest locus (which carton), never the placement one (which shelf).
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

  // The focus-scan quick-key is now the app-wide shared hotkey (default Insert,
  // reassignable via the gear in any StationScanBar). The unbox/triage bars
  // register themselves as the focus target through StationScanBar, so the key
  // snaps focus here with no receiving-specific handler. The
  // `receiving-focus-scan` listener above remains for the Quick Access chips.

  return (
    // `relative` anchors the edit-mode SelectionActionBar pinned at the bottom.
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      <RailEditModeProvider
        active={railEditMode && isScanSurface}
        selectedIds={railSelectedIds}
        toggle={toggleRailSelected}
        setMany={setManyRailSelected}
        toggleActive={toggleRailEditMode}
      >
        {/* L2 Mode + Recents live in GlobalHeader house-wide
            (HeaderPageSwitcher). Do not remount ReceivingModeSwitcher. */}

        {mode === 'incoming' ? (
          // Incoming PO sync + email-triage band. Search / filters / Select live
          // in IncomingWorkspaceHeader on the right pane.
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <IncomingSidebarPanel />
          </div>
        ) : mode === 'repair' ? (
          // Repair Favorites + intake overlay. Active/Done · search · Add live in
          // RepairWorkspaceHeader on the right pane (RepairTable).
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <RepairSidebarPanel embedded hideSectionHeader />
          </div>
        ) : mode === 'pickup' ? (
          // Local Pickup — station scan bar (open/match LCPU) + orders rail.
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
            <SidebarRailScrollport>
              <PickupSidebarRail
                filterText={pickupRailFilter}
                facets={pickupRailFacets}
              />
            </SidebarRailScrollport>
            <TechRailSearchBar
              value={pickupRailFilter}
              onChange={setPickupRailFilter}
              placeholder="Filter pickup…"
              trailingSuffix={
                <PickupRailFilters
                  facets={pickupRailFacets}
                  onChange={setPickupRailFacets}
                />
              }
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
                  // Triage no longer spins the scan bar either — its loading state
                  // is the right-pane TriageWorkspaceSkeleton (surface-tagged),
                  // matching Unbox. Each mode shows its own skeleton, never a
                  // bar spinner or the other mode's display.
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
                onSubmit={(m) => {
                  // Unbox: one cache upsert on resolve (final title). No importing
                  // stub — that caused tracking# → Unfound PO flicker.
                  // Leaving Queue after a scan lands on the default tab.
                  if (unboxView === 'queue') updateUnboxView('history', { clearLine: false });
                  submitTrackingScan(undefined, { mode: m });
                }}
                inputRef={scanInputRef}
                // Unbox no longer spins the scan bar on a tracking scan. Loading
                // is the right-pane optimistic unmatched empty PO-items open
                // (settle remount), not ReceivingWorkspaceSkeleton / Opening chrome.
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

            {/* Scan-surface rail. Unbox keeps a fixed Unboxed rail; Triage keeps
                a fixed combined Triage rail — browse tabs live in the right-pane
                workbench (UnboxWorkspaceView / TriageWorkspaceView). */}
            <SidebarRailScrollport>
              <ReceivingRailBody
                mode={mode}
                selectedLine={selectedLine}
                triageLeadingRow={triageLeadingRow}
                triageFilterText={mode === 'triage' ? triageListQuery : ''}
                triageIncludeRow={
                  mode === 'triage' ? receivingRailFacets.includeRow : undefined
                }
                unboxFilterText={mode === 'receive' ? unboxRailFilter : ''}
                unboxIncludeRow={
                  mode === 'receive' ? receivingRailFacets.includeRow : undefined
                }
              />
            </SidebarRailScrollport>

            {/* Carton-list filter (D1) — finds a carton already in the
                Triage/Prioritize/Unfound/Done list, distinct from the scan band
                below and from the Zoho-PO search inside the pairing hub
                (PoLinkTab, kept as-is). Hidden while bulk-editing so it never
                collides with the selection action bar. */}
            {mode === 'triage' && !railEditMode ? (
              <TriageCartonSearchBar
                value={triageListQuery}
                onChange={updateTriageQuery}
                trailingSuffix={
                  <ReceivingRecentRailFilters
                    facets={receivingRailFacets.facets}
                    onChange={receivingRailFacets.setFacets}
                  />
                }
              />
            ) : null}

            {/* Unboxed rail filter — same bottom-anchored TechRailSearchBar as
                Testing/Shipping (paste hover-reveal + auto context-panel
                collapse). Facets seat in trailingSuffix so paste leads.
                Hidden while bulk-editing (bulk bar owns the footer). */}
            {mode === 'receive' && !railEditMode ? (
              <TechRailSearchBar
                value={unboxRailFilter}
                onChange={setUnboxRailFilter}
                placeholder="Filter unboxed…"
                trailingSuffix={
                  <ReceivingRecentRailFilters
                    facets={receivingRailFacets.facets}
                    onChange={receivingRailFacets.setFacets}
                  />
                }
              />
            ) : null}

            {/* Edit-mode bulk dismiss — rides at the very bottom of the rail. */}
            {railEditMode ? (
              <ReceivingBulkActionBar
                selectedIds={railSelectedIdList}
                onDismiss={handleRailBulkDismiss}
                busy={railBulkDismissing}
              />
            ) : null}
          </>
        )}
      </RailEditModeProvider>
    </div>
  );
}
