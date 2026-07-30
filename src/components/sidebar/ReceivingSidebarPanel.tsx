'use client';

/**
 * Receiving sidebar — thin composition layer.
 *
 * All business logic lives in focused hooks under `./receiving/`:
 *   - useReceivingMode .............. URL ⇄ mode + Unbox sub-view + nav
 *   - usePoContext .................. active carton + armed line
 *   - useSerialScan ................. serial scan + returns banner
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

import { TriageScanBand, UnboxScanBand } from '@/components/sidebar/receiving/ReceivingScanBands';
import { TriageCartonSearchBar } from '@/components/sidebar/receiving/TriageCartonSearchBar';
import { ReceivingRailBody } from '@/components/sidebar/receiving/ReceivingRailBody';
import { ReceivingBulkActionBar } from '@/components/sidebar/receiving/ReceivingBulkActionBar';
import { RepairSidebarPanel } from '@/components/sidebar/RepairSidebarPanel';
import { PickupSidebarRail } from '@/components/receiving/pickup/PickupSidebarRail';

import { useReceivingMode } from '@/components/sidebar/receiving/useReceivingMode';
import { usePoContext } from '@/components/sidebar/receiving/usePoContext';
import { useSerialScan } from '@/components/sidebar/receiving/useSerialScan';
import { useReceivingSourcePlatform } from '@/components/sidebar/receiving/useReceivingSourcePlatform';
import { useReceivingSelection } from '@/components/sidebar/receiving/useReceivingSelection';
import { useReceivingLineNavigation } from '@/components/sidebar/receiving/useReceivingLineNavigation';
import { useReceivingWorkspaceBridge } from '@/components/sidebar/receiving/useReceivingWorkspaceBridge';
import { useTrackingScan } from '@/components/sidebar/receiving/useTrackingScan';
import { usePhoneScanBridge } from '@/components/sidebar/receiving/usePhoneScanBridge';
import { usePhotoRequestPublisher } from '@/components/sidebar/receiving/usePhotoRequestPublisher';
import { useRailEditMode } from '@/components/sidebar/receiving/useRailEditMode';

export function ReceivingSidebarPanel() {
  const queryClient = useQueryClient();

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

  // ── Unbox session: PO context + serial scan ──────────────────────────────
  const { poContext, setPoContext, armedLineId, setArmedLineId, clearPoContext } = usePoContext();
  const {
    serialInputRef,
    returns,
    setPendingCandidates,
    dismissReturn,
    resetSerialInputs,
  } = useSerialScan({ poContext, armedLineId, staffId });

  // Source-platform mirror — called for its `receiving-package-updated` event
  // bridge side effect (the returned setter is owned by the line inspector).
  useReceivingSourcePlatform({ poContext, setPoContext });

  // Clearing a scan session resets the PO context + serial inputs together.
  const clearScanSession = useCallback(() => {
    clearPoContext();
    resetSerialInputs();
  }, [clearPoContext, resetSerialInputs]);

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
    scanMatchedRows,
    currentIndex,
    canPrev,
    canNext,
  });

  // ── Triage scan input (scan-only — NOT a list filter) ──
  const [triageQuery, setTriageQuery] = useState('');
  /** Pre-resolve row pinned at the top of the Triage list (tracking # title). */
  const [triageLeadingRow, setTriageLeadingRow] = useState<ReceivingLineRow | null>(null);
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
    setPendingCandidates,
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
  useEffect(() => {
    const handler = () =>
      requestAnimationFrame(() => {
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
            (HeaderModeSwitcher). Do not remount ReceivingModeSwitcher. */}

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
          // Local Pickup — LCPU orders rail (row = pickup order). Selecting one
          // writes `?lcpu=` to highlight its products in the right-pane table.
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PickupSidebarRail />
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
              // Triage is a scan surface: a tracking-only entry wired to the same
              // submitTrackingScan → lookup-po flow. Scan-only — the input never
              // filters the list (that's History mode); it just resolves + clears.
              <TriageScanBand
                themeColor={themeColor}
                value={triageQuery}
                onChange={setTriageQuery}
                onSubmit={() => {
                  const tracking = triageQuery.trim();
                  if (!tracking) return;
                  submitTrackingScan(tracking, {
                    mode: 'tracking',
                    onResult: onTriageScanResult,
                  });
                  setTriageQuery('');
                }}
                inputRef={scanInputRef}
                staffId={staffId}
                // Triage no longer spins the scan bar either — its loading state
                // is the right-pane TriageWorkspaceSkeleton (surface-tagged),
                // matching Unbox. Each mode shows its own skeleton, never a
                // bar spinner or the other mode's display.
                isResolving={false}
              />
            ) : (
              <UnboxScanBand
                themeColor={themeColor}
                value={bulkTracking}
                onChange={setBulkTracking}
                onSubmit={(m) => {
                  // Unbox: one cache upsert on resolve (final title). No importing
                  // stub — that caused tracking# → Unfound PO flicker.
                  if (unboxView === 'queue') updateUnboxView('recent', { clearLine: false });
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
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
              <ReceivingRailBody
                mode={mode}
                selectedLine={selectedLine}
                triageLeadingRow={triageLeadingRow}
                triageFilterText={mode === 'triage' ? triageListQuery : ''}
              />
            </div>

            {/* Carton-list filter (D1) — finds a carton already in the
                Triage/Prioritize/Unfound/Done list, distinct from the scan band
                below and from the Zoho-PO search inside the pairing hub
                (PoLinkTab, kept as-is). Hidden while bulk-editing so it never
                collides with the selection action bar. */}
            {mode === 'triage' && !railEditMode ? (
              <TriageCartonSearchBar value={triageListQuery} onChange={updateTriageQuery} />
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
