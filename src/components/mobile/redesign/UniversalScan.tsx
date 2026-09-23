'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, type PanInfo } from '@/design-system/motion';
import { framerTransition, tabPagerVariants } from '@/design-system/foundations/motion-framer';
import {
  History,
  Box,
  ReceivingModeArrival,
  TechModeTesting,
} from '@/components/Icons';
import {
  TOKENS,
  SectionHeader,
} from '@/components/mobile/redesign/DesignSystem';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { CaptureStack, useCaptureStackWindow } from '@/design-system/components/capture-stack';
import { ScanResultRow, type ScanFeedItem } from '@/components/mobile/feed/rows/ScanResultRow';
import { ScanTestingPanel } from '@/components/mobile/redesign/ScanTestingPanel';
import { ScanInput } from '@/components/mobile/redesign/ScanInput';
import { PrepackedProductSheet } from '@/components/mobile/redesign/PrepackedProductSheet';
import { ReceivingTriagePanel, TestingRecentPanel } from '@/components/mobile/redesign/ScanModeFeeds';
import { detectScanMode, type ScanMode } from '@/components/mobile/redesign/scan-mode';
import { MobileScanVerdictBanner } from '@/components/mobile/redesign/MobileScanVerdictBanner';
import {
  buildScanVerdict,
  scanFailureVerdict,
  type MobileScanVerdict,
} from '@/components/mobile/redesign/scan-verdict';
import { useRegisterNewScan } from '@/components/mobile/redesign/mobile-scan-cta';
import { resolveViaLookupPo, type ScanResolutionMode } from '@/lib/receiving/scan';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { useAuth } from '@/contexts/AuthContext';
import { useLabelPrintFeed, type LabelPrintFeedItem } from '@/hooks/useLabelPrintFeed';

const MODES: Array<{ id: ScanMode; label: string; icon: (p: { className?: string }) => JSX.Element; placeholder: string }> = [
  { id: 'receiving', label: 'Arrival', icon: ReceivingModeArrival, placeholder: 'Scan a tracking number' },
  { id: 'testing', label: 'Testing Orders', icon: TechModeTesting, placeholder: 'Scan a PO label (R-####)' },
  { id: 'cms', label: 'Prepacked Products', icon: Box, placeholder: 'Scan a product / unit label' },
];

export default function RedesignedMobileUniversalScan() {
  const [mode, setMode] = useState<ScanMode>('receiving');
  // Pager slide direction (+1 → next mode, -1 → prev) for both tap and swipe.
  const [direction, setDirection] = useState(0);
  const [testingQuery, setTestingQuery] = useState('');
  // The scanned unit label whose Prepacked Products sheet is open (null = closed).
  const [prepackScan, setPrepackScan] = useState<string | null>(null);
  /**
   * The last door-scan outcome. `seq` increments on every scan so a re-scan of
   * the SAME label still remounts the banner — without it, rescanning a carton
   * looks identical to a scan the gun never read.
   */
  const [verdict, setVerdict] = useState<{ value: MobileScanVerdict; seq: number } | null>(null);
  const [resolving, setResolving] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  // Audio + haptic scan confirm — the SoT the desktop receiving station already
  // fires (`useScanFeedback`). Both stay preference-gated; an eyes-down operator
  // on a phone needs the non-visual cue more than the desk does, not less.
  const { playScanFeedback } = useScanFeedback();
  const inFlight = useRef(false);
  const scanSeq = useRef(0);

  // Prepacked "Recent Scans" is the persistent label-print history — the same
  // feed as Products → Labels → History (station_activity_logs LABEL_PRINTED),
  // so it survives reloads instead of living in volatile React state.
  const { data: labelFeed = [], refetch: refetchLabels } = useLabelPrintFeed(12);
  const prepackScans = useMemo<ScanFeedItem[]>(
    () => labelFeed.map(mapLabelToScanItem),
    [labelFeed],
  );

  const active = MODES.find((m) => m.id === mode) ?? MODES[0];
  const ActiveIcon = active.icon;

  // Switch modes with the slide direction derived from MODES order, so the
  // result pager animates left/right consistently whether tapped or swiped.
  const changeMode = useCallback((next: ScanMode) => {
    setMode((cur) => {
      if (next === cur) return cur;
      const from = MODES.findIndex((m) => m.id === cur);
      const to = MODES.findIndex((m) => m.id === next);
      setDirection(to > from ? 1 : -1);
      return next;
    });
  }, []);

  // Commit a horizontal swipe to the adjacent mode past a distance/velocity
  // threshold. `dragDirectionLock` on the panel keeps vertical scroll intact.
  const handleSwipe = useCallback(
    (_: unknown, info: PanInfo) => {
      const current = MODES.findIndex((m) => m.id === mode);
      const dir =
        info.offset.x < -60 || info.velocity.x < -400
          ? 1
          : info.offset.x > 60 || info.velocity.x > 400
            ? -1
            : 0;
      const target = MODES[current + dir];
      if (dir && target) changeMode(target.id);
    },
    [mode, changeMode],
  );

  // Refetch the desktop-shared triage rails so a freshly door-scanned carton
  // shows up in Unfound / Prioritize (same keys the desktop sidebar uses).
  const refreshReceivingTriage = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table', 'rail', 'scanned'] });
    void queryClient.invalidateQueries({ queryKey: ['receiving', 'triage', 'unfound-list'] });
  }, [queryClient]);

  /** Publish an outcome: paint the banner and fire its matching audio/haptic cue. */
  const announce = useCallback(
    (next: MobileScanVerdict) => {
      scanSeq.current += 1;
      setVerdict({ value: next, seq: scanSeq.current });
      playScanFeedback(next.feedback);
    },
    [playScanFeedback],
  );

  // ── receiving handler (door scan-in → lookup-po) ───────────────────────────
  // Composes the receiving scan pipeline's `resolveViaLookupPo` rung — the same
  // classifier the desktop station runs — instead of a page-local fetch. The
  // inline version here THREW THE ANSWER AWAY: it read the response, returned,
  // and left the operator with no idea whether the carton matched, landed in
  // Unfound, or never reached the server at all.
  const runReceiving = useCallback(
    async (raw: string, callMode: ScanResolutionMode) => {
      try {
        const resolution = await resolveViaLookupPo(
          {
            callValue: raw,
            callMode,
            originalMode: callMode,
            staffId: Number(user?.staffId ?? 0),
            // `/m/scan` Arrival IS the door. Passed explicitly rather than left
            // to the route's default — which surface a scan came from decides
            // whether it stamps door-received, so it is a fact to state, not to
            // inherit.
            intakeSurface: 'triage',
          },
          {
            lookupPo: async (body) => {
              const res = await fetch('/api/receiving/lookup-po', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
              });
              return res.json();
            },
          },
        );
        announce(buildScanVerdict(raw, resolution));
      } catch (err) {
        // `resolveViaLookupPo` throws on a hard `!success`; `fetch` throws when
        // the phone drops off the wifi mid-aisle. Both must reach the operator.
        announce(scanFailureVerdict(raw, err));
      } finally {
        refreshReceivingTriage();
      }
    },
    [refreshReceivingTriage, announce, user?.staffId],
  );

  // ── dispatch: detect mode → animate slider → run the mode's handler ────────
  const dispatch = useCallback(
    async (value: string) => {
      const raw = value.trim();
      if (!raw || inFlight.current) return;
      inFlight.current = true;

      const detected = detectScanMode(raw);
      const target: ScanMode = detected ?? mode;
      if (target !== mode) {
        changeMode(target); // slider animates to the detected mode
      }

      try {
        if (target === 'testing') {
          // Resolve the scanned PO/serial into the inline testing panel; the
          // "Recently Tested" rail below is desktop-wired and refetches itself.
          setTestingQuery(raw);
          return;
        }

        if (target === 'cms') {
          // Prepacked: open the detail/verify sheet. The sheet owns resolution
          // (live unit → product metadata → unknown) so there's no dead-end.
          // The recent list is the persistent label-print history, not an
          // in-memory row, so just open the sheet here.
          setPrepackScan(raw);
          return;
        }

        // Receiving: door-scan lookup → verdict banner + triage rails refetch.
        //
        // An UNAMBIGUOUS carrier read stays in `tracking` mode. A value the
        // classifier could not place falls here too, and for that one `auto` is
        // the honest mode — it deep-scans the value as ticket#, PO#, and
        // tracking# before minting an unfound carton, which is exactly what an
        // un-armed universal scanner should do rather than assuming a carrier.
        setResolving(true);
        try {
          await runReceiving(raw, detected === 'receiving' ? 'tracking' : 'auto');
        } finally {
          setResolving(false);
        }
      } finally {
        inFlight.current = false;
      }
    },
    [mode, runReceiving, changeMode],
  );

  /**
   * "New scan" from the top-bar CTA while already standing on this surface:
   * clear the last outcome and the open panels so the next item starts clean.
   * The scan bar keeps focus, so the gun is armed the moment this returns.
   */
  const startNewScan = useCallback(() => {
    setVerdict(null);
    setTestingQuery('');
    setPrepackScan(null);
    changeMode('receiving');
  }, [changeMode]);
  useRegisterNewScan(startNewScan);

  // Prepacked "Recent Scans" is the only in-component feed left (label history).
  const { rows: feedRows, scrollRef } = useCaptureStackWindow(prepackScans, { limit: 12, anchor: 'top', freshPulse: false });

  return (
    <div className={`h-full ${TOKENS.colors.background} flex flex-col`}>
      {/* Mode slider (icons) + title */}
      <div className="px-4 pt-2 pb-1.5">
        <div className="mb-1.5 flex items-center gap-1.5 px-1">
          <ActiveIcon className="h-4 w-4 text-text-muted" />
          <h1 className="text-base font-semibold tracking-tight text-text-default">{active.label}</h1>
        </div>
        <HorizontalButtonSlider
          variant="segmented"
          aria-label="Scan mode"
          value={mode}
          onChange={(id) => changeMode(id as ScanMode)}
          items={MODES.map((m) => ({ id: m.id, label: m.label, icon: m.icon }))}
        />
      </div>

      {/* Scan surface — compact StationScanBar + optional camera viewfinder. */}
      <div className="flex flex-col gap-2 px-4 pb-2">
        <ScanInput
          onDecode={dispatch}
          placeholder={active.placeholder}
          autoFocus
          isResolving={resolving}
          cameraSuspended={prepackScan != null}
        />

        {/* The answer to the last door scan, directly under the bar the operator
            is already looking at. Station law: a state-changing scan lands as a
            card, never a toast that expires while their eyes are on the carton.
            Keyed by `seq` so a repeat scan of the same label replays. */}
        {mode === 'receiving' && verdict && (
          <MobileScanVerdictBanner
            key={verdict.seq}
            verdict={verdict.value}
            onOpenCarton={(receivingId) => router.push(`/m/r/${receivingId}`)}
          />
        )}
      </div>

      {/* Result area — a swipeable pager across the three scan modes. Drag
          left/right to move between Arrival, Testing Orders and
          Prepacked Products; both panels share one grid cell so heights don't
          jump, and `dragDirectionLock` keeps each list's vertical scroll. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden bg-surface-canvas">
        <AnimatePresence mode="sync" custom={direction} initial={false}>
        <motion.div
          key={mode}
          custom={direction}
          variants={tabPagerVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={framerTransition.sliderIndicator}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={handleSwipe}
          className="col-start-1 row-start-1 flex min-h-0 touch-pan-y flex-col bg-surface-canvas"
        >
          {mode === 'testing' ? (
            // Testing — desktop-wired "Recently Tested" rail above the inline
            // PO-items testing panel (which the active scan resolves into).
            <div className="min-h-0 flex-1 overflow-y-auto pt-2">
              <TestingRecentPanel />
              <ScanTestingPanel query={testingQuery} />
            </div>
          ) : mode === 'receiving' ? (
            // Receiving — desktop triage: Unfound / Prioritize dropdown picker
            // (same endpoints + query keys as the desktop sidebar rails).
            <div className="flex min-h-0 flex-1 flex-col pt-2">
              <ReceivingTriagePanel />
            </div>
          ) : (
            // Prepacked — persistent label-print history; tap a row to re-open.
            <div className="flex min-h-0 flex-1 flex-col pt-2">
              <div className="px-6">
                <SectionHeader title="Recent Scans" />
              </div>
              <CaptureStack<ScanFeedItem>
                rows={feedRows}
                expandLast={false}
                scrollRef={scrollRef}
                className="pb-32"
                empty={
                  <div className="py-12 text-center opacity-40">
                    <History className="mx-auto mb-3 h-10 w-10 text-text-faint" />
                    <p className="text-xs font-semibold uppercase tracking-widest text-text-faint">
                      No recently printed products…
                    </p>
                  </div>
                }
                renderRow={(item) => (
                  <ScanResultRow item={item} onClick={() => setPrepackScan(item.primary)} />
                )}
              />
            </div>
          )}
        </motion.div>
        </AnimatePresence>
      </div>

      {/* Prepacked Products: scan-to-verify detail + scan-to-locate put-away. */}
      <PrepackedProductSheet
        scanned={prepackScan}
        onClose={() => {
          setPrepackScan(null);
          // A put-away/print during the sheet may have changed the label feed.
          if (mode === 'cms') void refetchLabels();
        }}
      />
    </div>
  );
}

/**
 * Map a persistent label-print row → the shared scan-feed row shape so the
 * Prepacked "Recent Scans" list reuses {@link ScanResultRow}. Tapping a row
 * re-opens the detail sheet for that unit (handled in renderRow).
 */
function mapLabelToScanItem(row: LabelPrintFeedItem): ScanFeedItem {
  // primary = the scannable identity (drives tap → re-open the detail sheet);
  // title/subtitle = the user-friendly product title over its SKU.
  const primary = row.unit_id ?? row.serial_number ?? row.sku ?? String(row.id);
  return {
    id: `label-${row.id}`,
    primary,
    title: row.product_title ?? 'Prepacked Product',
    serial: row.serial_number ?? row.unit_id ?? null,
    subtitle: row.sku ?? null,
    at: new Date(row.printed_at),
    state: 'ok',
    statusLabel: row.current_status ?? 'Printed',
    meta: null,
    href: null,
  };
}
