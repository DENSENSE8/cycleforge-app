'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Barcode, Hash, MapPin, Package, Pencil } from '@/components/Icons';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { TestingScanBar } from '@/components/sidebar/receiving/TestingScanBar';
import { ScanBandShell, isScanPreview, useScanModeRelease } from '@/components/station/scan-bar';
import { TestingRecentRail } from '@/components/sidebar/receiving/TestingRecentRail';
import { SearchField } from '@/design-system/primitives/SearchField';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { ReceivingRecentRailFilters } from '@/components/sidebar/rail-shell/ReceivingRecentRailFilters';
import { useReceivingRailFacets } from '@/components/sidebar/rail-shell/useReceivingRailFacets';
import { useIsMobile } from '@/hooks';
import { useStationTheme } from '@/hooks/useStationTheme';
import {
  resolveTestingScan,
  type ResolvedVia,
  type ForcedTestingType,
} from '@/lib/testing/resolve-testing-scan';
import {
  INITIAL_TESTING_SCAN_SESSION,
  testingScanSessionReducer,
} from '@/lib/testing/testing-scan-session';
import {
  publishTestingScanPick,
  publishTestingScanSession,
  useTestingScanPickResolved,
} from '@/lib/testing/testing-scan-session-bridge';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { seedReceivingSiblingsCache } from '@/lib/queries/receiving-queries';
import {
  readSelectLineDetail,
  type ReceivingSelectLineDetail,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { BoxWorkbenchPanel } from '@/components/receiving/BoxWorkbenchPanel';
import { ManifestWorkbenchPanel } from '@/components/receiving/ManifestWorkbenchPanel';
import { useRegisterScanSink } from '@/lib/station-scan-sink';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import { useUnitPhotoRequestPublisher } from '@/components/sidebar/receiving/useUnitPhotoRequestPublisher';
import { scannedUnitKey } from '@/lib/barcode-routing';
import { UnitPhotoRequestStatus } from '@/components/station/UnitPhotoRequestStatus';

interface Props {
  /**
   * Optional override for the rail's highlighted line. When omitted, the
   * sidebar tracks selection itself by listening for `receiving-select-line`.
   */
  selectedLineId?: number | null;
  /** Staff id used to theme the scan bar's input border. */
  staffId?: string;
}

function viaFoundLabel(via: string | undefined): string | null {
  if (via === 'serial') return 'serial number';
  if (via === 'po') return 'PO number';
  if (via === 'tracking') return 'tracking number';
  if (via === 'sku') return 'product SKU';
  if (via === 'handle') return 'carton handle';
  return null;
}

function viaAckMeta(via: ResolvedVia): { label: string; Icon: typeof MapPin; chip: string } {
  switch (via) {
    case 'tracking':
      return { label: 'Tracking', Icon: MapPin, chip: 'bg-blue-50 text-blue-700 ring-blue-200' };
    case 'po':
      return { label: 'PO#', Icon: Hash, chip: 'bg-surface-canvas text-text-muted ring-border-soft' };
    case 'sku':
      return { label: 'SKU', Icon: Pencil, chip: 'bg-yellow-50 text-yellow-700 ring-yellow-200' };
    case 'serial':
    case 'unit_id':
      return { label: via === 'unit_id' ? 'Unit ID' : 'Serial', Icon: Barcode, chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
    case 'handle':
    case 'receiving_id':
    default:
      return { label: 'Carton', Icon: Package, chip: 'bg-surface-canvas text-text-muted ring-border-soft' };
  }
}

/** Compact line summary shown in the enriched post-scan ack strip. */
function lineAckSummary(row: ReceivingLineRow): {
  title: string;
  received?: number | null;
  expected?: number | null;
} {
  return {
    title: row.item_name || row.sku || `Line #${row.id}`,
    received: row.quantity_received,
    expected: row.quantity_expected,
  };
}

/**
 * Frame-1 siblings paint for Testing open (scan / picker). Resolve already
 * returns include=serials rows — seed before select so PoLinesAccordion never
 * cold-fetches an empty projection.
 */
function seedTestingOpenLine(
  queryClient: ReturnType<typeof useQueryClient>,
  row: ReceivingLineRow,
): void {
  const receivingId = row.receiving_id;
  if (receivingId == null || receivingId <= 0 || row.id <= 0) return;
  seedReceivingSiblingsCache(queryClient, receivingId, [row]);
}

/**
 * Tech sidebar for Testing mode — Pass+Print / unit-label creation surface.
 * Scan band + To Test / Tested rail. STN anchors a line; unit-label scan
 * confirms prepack identity (TRK↔SKU + serials feedback).
 */
export function TestingSidebarPanel({
  selectedLineId: selectedLineIdProp,
  staffId,
}: Props) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { theme: themeColor } = useStationTheme({ staffId: staffId ? Number(staffId) : 0 });
  const [railFilter, setRailFilter] = useState('');
  const receivingRailFacets = useReceivingRailFacets();
  const [scanValue, setScanValue] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [armedMode, setArmedMode] = useState<ForcedTestingType | null>(null);
  const [lastAck, setLastAck] = useState<{
    via: ResolvedVia;
    value: string;
    line?: ReturnType<typeof lineAckSummary> | null;
  } | null>(null);
  const [session, dispatchSession] = useReducer(
    testingScanSessionReducer,
    INITIAL_TESTING_SCAN_SESSION,
  );
  // The session DISPLAY lives in the workspace (one region per active entity —
  // see TestingScanSessionFeedback). The reducer stays here because the scan bar
  // feeds it; only the computed value crosses the tree boundary.
  useEffect(() => {
    publishTestingScanSession(session);
  }, [session]);
  // Unmounting the scan column (leaving Testing) clears any pending choice —
  // the middle must never keep asking a question nothing can answer.
  useEffect(() => () => publishTestingScanPick(null), []);
  // The candidate list itself renders in the MIDDLE (`TestingScanPickPanel`) —
  // a browsable list is the one shape the scan column must not carry
  // (display/station.md §11). This column only raises it and applies the answer.
  const [pendingVia, setPendingVia] = useState<ResolvedVia | null>(null);
  const [boxPanel, setBoxPanel] = useState<{ id: number; lines: ReceivingLineRow[] } | null>(null);
  const [manifestPanel, setManifestPanel] = useState<{ ref: string } | null>(null);
  const [internalSelectedRow, setInternalSelectedRow] =
    useState<ReceivingLineRow | null>(null);
  const [lastUnitPhotoRequest, setLastUnitPhotoRequest] = useState<{
    serialUnitId: number;
    unitKey: string | null;
  } | null>(null);
  const internalSelectedId = internalSelectedRow?.id ?? null;
  const selectedLineId = selectedLineIdProp ?? internalSelectedId;

  const { user } = useAuth();
  const authOrgId = user?.organizationId;
  const authStaffId = user?.staffId ?? 0;
  const { getClient: getAblyClient } = useAblyClient();
  const unitPhotoChannelName = safeChannelName(() =>
    getStaffStationBridgeChannelName(authOrgId!, authStaffId),
  );
  const publishUnitPhotoRequest = useUnitPhotoRequestPublisher({
    staffIdNum: authStaffId,
    getAblyClient,
    stationChannelName: unitPhotoChannelName,
  });

  const requestUnitPhotos = useCallback(
    (rawInput: string) => {
      const key = scannedUnitKey(rawInput);
      if (!key) return;
      void (async () => {
        try {
          const res = await fetch(`/api/serial-units/${encodeURIComponent(key)}/photos`);
          if (!res.ok) return;
          const data = await res.json().catch(() => null);
          const serialUnitId = Number(data?.unit_id);
          if (!Number.isFinite(serialUnitId) || serialUnitId <= 0) return;
          await publishUnitPhotoRequest({ serialUnitId, unitKey: key });
          setLastUnitPhotoRequest({ serialUnitId, unitKey: key });
        } catch (err) {
          console.warn('testing-sidebar: unit photo request failed', err);
        }
      })();
    },
    [publishUnitPhotoRequest],
  );

  useEffect(() => {
    if (selectedLineIdProp !== undefined) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ReceivingSelectLineDetail>).detail;
      const { row } = readSelectLineDetail(detail);
      setInternalSelectedRow(row ?? null);
    };
    window.addEventListener('receiving-select-line', handler);
    return () => window.removeEventListener('receiving-select-line', handler);
  }, [selectedLineIdProp]);

  const inFlightRef = useRef(false);

  const applyLineToSession = useCallback(
    (row: ReceivingLineRow, via: ResolvedVia | undefined, value: string) => {
      if (via === 'tracking') {
        dispatchSession({
          type: 'ANCHOR_TRACKING',
          trackingRef: value,
          line: row,
          via,
        });
        return;
      }
      if (via === 'unit_id' || via === 'serial') {
        const unitKey = scannedUnitKey(value) || value.trim();
        dispatchSession({
          type: 'CONFIRM_UNIT',
          unitKey,
          line: row,
          via: via ?? 'unit_id',
        });
        requestUnitPhotos(value);
        return;
      }
      if (via) {
        dispatchSession({
          type: 'OPEN_LINE',
          line: row,
          via,
          value,
        });
      }
    },
    [requestUnitPhotos],
  );

  /**
   * The middle resolved the ambiguity. Apply it exactly as a single-line scan
   * would have — the session reducer lives here, so opening the line has to
   * happen here too (see `testing-scan-session-bridge` → resolveTestingScanPick).
   */
  const handlePickResolved = useCallback(
    (row: ReceivingLineRow) => {
      seedTestingOpenLine(queryClient, row);
      dispatchSelectLine(row);
      const via = pendingVia ?? 'receiving_id';
      setLastAck((prev) => ({
        via,
        value: prev?.value ?? '',
        line: lineAckSummary(row),
      }));
      applyLineToSession(row, via, lastAck?.value ?? '');
      publishTestingScanPick(null);
      setPendingVia(null);
      setScanValue('');
    },
    [queryClient, pendingVia, lastAck?.value, applyLineToSession],
  );
  useTestingScanPickResolved(handlePickResolved);

  const runScan = useCallback(async (rawValue: string, forcedType: ForcedTestingType | null) => {
    const value = rawValue.trim();
    if (!value || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsResolving(true);
    try {
      const result = await resolveTestingScan(value, { forcedType });
      switch (result.kind) {
        case 'line': {
          publishTestingScanPick(null);
          seedTestingOpenLine(queryClient, result.row);
          dispatchSelectLine(result.row);
          setScanValue('');
          setArmedMode(null);
          if (result.via) setLastAck({ via: result.via, value, line: lineAckSummary(result.row) });
          applyLineToSession(result.row, result.via, value);
          const label = viaFoundLabel(result.via);
          if (label) {
            toast.success(`Found via ${label}`, { description: 'Opened the matching receiving line.' });
          }
          break;
        }
        case 'multi': {
          publishTestingScanPick({ rows: result.rows, via: result.via, value });
          setPendingVia(result.via ?? null);
          setArmedMode(null);
          if (result.via) setLastAck({ via: result.via, value });
          const label = viaFoundLabel(result.via);
          if (label) toast.success(`Found via ${label}`, { description: 'Pick the line to test.' });
          break;
        }
        case 'box': {
          setBoxPanel({ id: result.handlingUnitId, lines: result.rows });
          // ONE registrar per rendered rail: box and kit are two occupants of
          // the single RightRailHost slot, so a kit scan followed by a box scan
          // used to leave both registrars mounted and the second silently
          // evicted the first. Opening one closes the other.
          setManifestPanel(null);
          publishTestingScanPick(null);
          setScanValue('');
          setArmedMode(null);
          setLastAck({ via: result.via, value });
          toast.success('Opened box', { description: `H-${result.handlingUnitId}` });
          break;
        }
        case 'manifest': {
          setManifestPanel({ ref: result.manifestRef });
          // Same single-slot rule as the box branch above.
          setBoxPanel(null);
          publishTestingScanPick(null);
          setScanValue('');
          setArmedMode(null);
          toast.success('Opened kit', { description: result.manifestRef });
          break;
        }
        case 'not_found': {
          const what =
            forcedType === 'po' ? 'PO'
              : forcedType === 'tracking' ? 'tracking'
                : forcedType === 'serial' ? 'serial'
                  : 'receiving line';
          toast.error('Not found', { description: `No ${what} match for "${result.query}".` });
          break;
        }
        case 'error': {
          toast.error('Lookup failed', { description: result.message });
          break;
        }
      }
    } finally {
      inFlightRef.current = false;
      setIsResolving(false);
    }
  }, [applyLineToSession, queryClient]);

  const handleSubmit = useCallback(() => {
    if (isScanPreview()) return;
    void runScan(scanValue, armedMode);
  }, [runScan, scanValue, armedMode]);

  // Carton / lookup sink when no active line adder owns `po-line:`.
  useRegisterScanSink({
    id: 'testing-scan-bar',
    enabled: true,
    onScan: (raw) => {
      if (isScanPreview()) {
        setScanValue(raw);
        return;
      }
      void runScan(raw, armedMode);
    },
    focus: () => {
      document.querySelector<HTMLInputElement>('[data-testing-scan] input')?.focus();
    },
  });

  const releaseArmedMode = useCallback(() => setArmedMode(null), []);
  useScanModeRelease(armedMode != null, releaseArmedMode);

  const toggleMode = useCallback(
    (mode: ForcedTestingType) => {
      const turningOff = armedMode === mode;
      const next = turningOff ? null : mode;
      setArmedMode(next);
      const pending = scanValue.trim();
      if (next && pending && !isScanPreview()) {
        void runScan(scanValue, next);
        return;
      }
      requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>('[data-testing-scan] input')?.focus();
      });
    },
    [armedMode, scanValue, runScan],
  );

  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>('[data-testing-scan] input')?.focus();
      });
    };
    window.addEventListener('testing-focus-scan', handler);
    return () => window.removeEventListener('testing-focus-scan', handler);
  }, []);

  const scanBarBlock = (
    <TestingScanBar
      value={scanValue}
      onChange={setScanValue}
      onSubmit={handleSubmit}
      isResolving={isResolving}
      staffId={staffId}
      armedMode={armedMode}
      onToggleMode={toggleMode}
    />
  );

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden ${appChromeClass}`}>
      {!isMobile ? (
        <>
          {/* Flush 40px band — same ScanBandShell geometry as Unbox (no py around the bar). */}
          <ScanBandShell themeColor={themeColor}>{scanBarBlock}</ScanBandShell>
          <div className={SIDEBAR_GUTTER}>
            {lastUnitPhotoRequest ? (
              <div className="mt-1.5">
                <UnitPhotoRequestStatus
                  serialUnitId={lastUnitPhotoRequest.serialUnitId}
                  unitKey={lastUnitPhotoRequest.unitKey}
                />
              </div>
            ) : null}
            {!session.line && lastAck ? (() => {
              const meta = viaAckMeta(lastAck.via);
              return (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset ${meta.chip}`}>
                    <meta.Icon className="h-3 w-3 shrink-0" />
                    {meta.label}
                  </span>
                  <span className="min-w-0 shrink-0 truncate font-mono text-role-micro text-text-muted" title={lastAck.value}>
                    {lastAck.value}
                  </span>
                  {lastAck.line ? (
                    <span className="min-w-0 truncate text-role-micro font-semibold text-text-soft">
                      · {lastAck.line.title}
                      {typeof lastAck.line.received === 'number'
                        ? ` · ${lastAck.line.received}/${lastAck.line.expected ?? '?'}`
                        : ''}
                    </span>
                  ) : null}
                </div>
              );
            })() : null}
          </div>
        </>
      ) : null}


      <SidebarRailScrollport>
        <TestingRecentRail
          selectedLineId={selectedLineId}
          selectedRow={internalSelectedRow}
          testerId={staffId ? Number(staffId) : null}
          filterText={railFilter}
          includeRow={receivingRailFacets.includeRow}
        />
      </SidebarRailScrollport>

      <SearchField
        value={railFilter}
        onChange={setRailFilter}
        placeholder="Filter recent…"
        rightElement={
          <ReceivingRecentRailFilters
            facets={receivingRailFacets.facets}
            onChange={receivingRailFacets.setFacets}
          />
        }
        />

      {isMobile ? (
        <div className="flex-shrink-0 border-t border-border-hairline bg-surface-card pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <ScanBandShell themeColor={themeColor}>{scanBarBlock}</ScanBandShell>
        </div>
      ) : null}

      {/* Box / manifest workbenches are non-modal rail inspectors: an operator
          re-sorting units at the bench needs the scan feed and the recent rail
          beside them, and a scrim hid exactly that. Ids stay per-entity — these
          open from a SCAN, not from walking a queue row by row.

          EXACTLY ONE of these is ever mounted (the scan branches clear the
          other), because both claim the single RightRailHost slot: two live
          registrars means the loser is evicted with no trace of why. Each body
          owns the ONE band and paints NO close — the host's singleton `✕` fires
          `closeRightPanel`, which runs the `onClose` below as its teardown. */}
      {boxPanel ? (
        <DetailStackRailRegistrar
          id={`box:${boxPanel.id}`}
          // Scan-opened on a Station bench: a width tween that reflows the bench at
          // the instant a barcode fires is not the explicit gesture the push
          // mechanism requires, and `StationDisplaysPushColumn` already owns this edge here.
          push={false}
          onClose={() => setBoxPanel(null)}
          modal={false}
          ariaLabel={`Box H-${boxPanel.id} workbench`}
        >
          <BoxWorkbenchPanel
            handlingUnitId={boxPanel.id}
            onClose={() => setBoxPanel(null)}
            lines={boxPanel.lines}
          />
        </DetailStackRailRegistrar>
      ) : null}

      {manifestPanel ? (
        <DetailStackRailRegistrar
          id={`manifest:${manifestPanel.ref}`}
          // Scan-opened on a Station bench: a width tween that reflows the bench at
          // the instant a barcode fires is not the explicit gesture the push
          // mechanism requires, and `StationDisplaysPushColumn` already owns this edge here.
          push={false}
          onClose={() => setManifestPanel(null)}
          modal={false}
          ariaLabel={`Kit manifest ${manifestPanel.ref} workbench`}
        >
          <ManifestWorkbenchPanel manifestRef={manifestPanel.ref} onClose={() => setManifestPanel(null)} />
        </DetailStackRailRegistrar>
      ) : null}
    </div>
  );
}
