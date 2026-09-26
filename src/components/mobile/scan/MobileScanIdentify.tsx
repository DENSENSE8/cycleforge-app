'use client';

/** `/m/scan` — identification kernel on the phone. */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives';
import { useNetworkOnline } from '@/hooks/useConnectionHealth';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { vibrateScan } from '@/lib/scan-feedback/play';
import { useRegisterNewScan } from '@/components/mobile/redesign/mobile-scan-cta';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { MobileStationShell } from '@/components/mobile/station/MobileStationShell';
import { STATION_EYEBROW_CLASS } from '@/components/mobile/station/station-chrome';
import {
  pushStationTape,
  stationDedupeId,
  STATION_TAPE_LIMIT,
  type StationTapeEntry,
} from '@/components/mobile/station/station-tape';
import {
  parseArrivalClassifyStep,
  parseArrivalReceivingId,
  parseArrivalTypeHint,
} from '@/lib/receiving/arrival-mobile-flow';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { locationHubHref } from '@/lib/mobile/location-hub-href';
import { fnskuHubHref } from '@/lib/mobile/fnsku-hub-href';
import { routeScan, unwrapScannedLocation, locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { fnskuFromTail } from '@/lib/scan-resolver';
import { fetchFnskuRecord } from '@/components/mobile/fnsku/useFnskuRecord';
import { landOutboundTracking } from '@/components/mobile/shipping/shipment/outbound-scan-land';
import { landScanIdentify } from '@/lib/scan/identify-land';
import { QC_SCAN_SESSION } from '@/lib/scan/dispatch-table';
import { useScanDispatch } from '@/hooks/useScanDispatch';
import { cn } from '@/utils/_cn';
import { recordMobileSessionEntry } from '@/lib/mobile/mobile-session-feed';
import { MobileArrivalClassifyFlow } from '@/components/mobile/receiving/MobileArrivalClassifyFlow';
import { ARRIVAL_DEDUPE_KIND, arrivalTapeEntry, type SettledArrival } from '@/components/mobile/receiving/arrival-station-tape';
import { useArrivalHistory } from '@/components/mobile/receiving/useArrivalHistory';
import { useArrivalStation } from '@/components/mobile/receiving/useArrivalStation';

function locationFace(code: string): string {
  const segs = parseLocationCodeFlat(code);
  return segs ? locationCode(segs) : code;
}

/** The scan-tape / session-feed row for a location that opened its record. */
function locationTapeEntry(code: string, seq: number): StationTapeEntry {
  return {
    id: `location-${seq}`,
    tone: 'ok',
    verb: 'Location',
    title: 'Location',
    identifier: locationFace(code),
    recordId: null,
    conditionGrade: null,
    imageUrl: null,
    actor: null,
    actorId: null,
    message: 'Opened the location record',
    at: new Date().toISOString(),
    dedupeKey: `location:${code.toUpperCase()}`,
    live: true,
  };
}

function MobileScanIdentifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classifyRid = parseArrivalReceivingId(searchParams.get('rid'));
  const classifyStep = parseArrivalClassifyStep(searchParams.get('step'));
  const classifyTypeHint = parseArrivalTypeHint(searchParams.get('type'));
  const qcArmed = searchParams.get('work') === 'qc';

  const [tape, setTape] = useState<StationTapeEntry[]>([]);
  const { history, isError: historyFailed, retry: retryHistory } = useArrivalHistory();
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || history.length === 0) return;
    setSeeded(true);
    setTape((prev) => {
      const live = new Set(prev.map((row) => row.dedupeKey).filter(Boolean));
      return [...prev, ...history.filter((row) => !row.dedupeKey || !live.has(row.dedupeKey))].slice(
        0,
        STATION_TAPE_LIMIT,
      );
    });
  }, [history, seeded]);

  const [cameraOff, setCameraOff] = useState(false);
  const [arrived, setArrived] = useState(0);
  const [armRequest, setArmRequest] = useState(0);
  useRegisterNewScan(() => setArmRequest((n) => n + 1));

  const { playScanFeedback, hapticOn } = useScanFeedback();
  const online = useNetworkOnline();

  const onSettled = useCallback(
    (settled: SettledArrival) => {
      setTape((prev) => pushStationTape(prev, arrivalTapeEntry(settled)));
      recordMobileSessionEntry({
        id: `unbox-${settled.seq}`,
        job: 'unbox',
        title: settled.title,
        identifier: settled.tracking ?? settled.scanned,
        entityId: settled.receivingId == null ? null : String(settled.receivingId),
        state: settled.status === 'arrived' || settled.status === 'known' ? 'done' : settled.status === 'refused' ? 'miss' : 'error',
        href: settled.receivingId == null ? '/m/scan' : `/m/r/${settled.receivingId}`,
        at: new Date().toISOString(),
        dedupeKey: settled.receivingId == null ? null : `unbox:${settled.receivingId}`,
      });
      if (settled.status === 'arrived') setArrived((n) => n + 1);
      const kind = settled.status === 'arrived' ? 'success' : 'reject';
      playScanFeedback(kind);
      if (!hapticOn) vibrateScan(kind);
    },
    [playScanFeedback, hapticOn],
  );

  const { submitRaw, inFlight } = useArrivalStation({ onSettled });
  const { resolve } = useScanDispatch();
  const [dispatching, setDispatching] = useState(0);
  const locationSeqRef = useRef(0);

  const applyLocationTape = useCallback((entry: StationTapeEntry, href: string) => {
    setTape((prev) => pushStationTape(prev, entry));
    recordMobileSessionEntry({
      id: entry.id,
      job: 'display',
      title: entry.title,
      identifier: entry.identifier,
      entityId: null,
      state: 'done',
      href,
      at: entry.at,
      dedupeKey: entry.dedupeKey ? `display:${entry.dedupeKey}` : null,
    });
  }, []);

  const onDecode = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      setDispatching((n) => n + 1);
      void (async () => {
        try {
          const dispatch = await resolve(value, qcArmed ? QC_SCAN_SESSION : null);
          const returnTo = searchParams.get('returnTo');
          if (returnTo === '/m/orders/new') {
            // The shared dispatch path has already classified this scan. Return
            // the raw value to the mobile intake surface so it can decide whether
            // it is an order number, SKU, or item number without a second parser.
            router.push(`/m/orders/new?scan=${encodeURIComponent(value)}`);
            return;
          }
          if (!dispatch) {
            submitRaw(value);
            return;
          }
          const route = routeScan(value);
          // A bare 7-character guess may be an FNSKU tail; the catalog decides.
          const tail = route?.redirect ? null : fnskuFromTail(value);
          if (tail && (await fetchFnskuRecord(tail).catch(() => null))) {
            router.push(fnskuHubHref(tail));
            return;
          }
          const land = landScanIdentify(dispatch, route);
          if (land.kind === 'identify') {
            router.push(land.href);
            return;
          }
          if (land.kind === 'intake') {
            // A never-seen tracking may be a box WE packed or shipped — that
            // is its package (or its order), not an inbound arrival.
            const outbound = route?.type === 'carrier-tracking' ? await landOutboundTracking(value, '/m/scan') : null;
            if (outbound) {
              router.push(outbound);
              return;
            }
            submitRaw(value);
            return;
          }
          if (route?.type === 'bin' || route?.type === 'bin-paired-order') {
            // A location is a full-screen record with an X back here, never
            // a sheet over the camera (operator 2026-09-25).
            const code = unwrapScannedLocation(value);
            const href = locationHubHref(code);
            applyLocationTape(locationTapeEntry(code, ++locationSeqRef.current), href);
            playScanFeedback('success');
            if (!hapticOn) vibrateScan('success');
            router.push(href);
          }
        } finally {
          setDispatching((n) => Math.max(0, n - 1));
        }
      })();
    },
    [resolve, qcArmed, router, searchParams, submitRaw, playScanFeedback, hapticOn, applyLocationTape],
  );

  // The kernel owns hardware scans on this screen.
  useEffect(() => {
    const onWedge = (event: Event) => {
      const raw = (event as CustomEvent<{ value?: string }>).detail?.value;
      if (!raw?.trim()) return;
      event.preventDefault();
      onDecode(raw);
    };
    window.addEventListener('wedge-scan', onWedge);
    return () => window.removeEventListener('wedge-scan', onWedge);
  }, [onDecode]);

  /**
   * A carton row opens the carton itself (operator 2026-09-24:
   * A carton row opens the carton itself (operator 2026-09-24: the primary
   */
  const opens = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const entry of tape) {
      if (!entry.dedupeKey) continue;
      if (entry.dedupeKey.startsWith('location:')) {
        const href = locationHubHref(entry.dedupeKey.slice('location:'.length));
        map.set(entry.dedupeKey, () => router.push(href));
        continue;
      }
      const receivingId = stationDedupeId(ARRIVAL_DEDUPE_KIND, entry.dedupeKey);
      if (receivingId == null) continue;
      const href = withJobReturn(`/m/r/${receivingId}`, '/m/scan');
      map.set(entry.dedupeKey, () => router.push(href));
    }
    return map;
  }, [tape, router]);

  const itemOpen = useCallback(
    (entry: StationTapeEntry): (() => void) | null => (entry.dedupeKey && opens.get(entry.dedupeKey)) || null,
    [opens],
  );

  /**
   * Unsettled commits — the lip lane's input, and the only thing on the panel
   * that animates. Zero means the server has answered everything.
   */
  const pending = inFlight + dispatching;

  /** The middle slot, as a COUNT. */
  const status = useMemo(() => {
    if (!online) return 'Offline';
    if (cameraOff) return 'Camera off';
    if (pending > 0) return `${pending} pending · ${arrived} in`;
    return `${arrived} in`;
  }, [online, cameraOff, pending, arrived]);

  if (classifyRid != null) {
    return (
      <MobileArrivalClassifyFlow receivingId={classifyRid} step={classifyStep} typeHint={classifyTypeHint} />
    );
  }

  return (
    <MobileStationShell
      tape={tape}
      untitledLabel="Package"
      empty={
        <div className="flex flex-col items-center gap-3 px-8 pb-6 text-center">
          {historyFailed ? (
            <>
              <p className={cn('text-role-eyebrow text-text-danger', STATION_EYEBROW_CLASS)}>
                Could not load earlier packages
              </p>
              <Button
                variant="secondary"
                size="lg"
                radius="mode"
                className="min-h-mode-hit"
                onClick={() => void retryHistory()}
              >
                Try again
              </Button>
            </>
          ) : qcArmed ? (
            <p className={cn('text-role-eyebrow text-text-soft', STATION_EYEBROW_CLASS)}>
              Quality control — scan the unit label unbox put on the unit
            </p>
          ) : (
            <p className={cn('text-role-eyebrow text-text-soft', STATION_EYEBROW_CLASS)}>
              Scan a tracking number or location code
            </p>
          )}
        </div>
      }
      itemOpen={itemOpen}
      window={
        <MobileCaptureWindow
          label="Scan camera"
          collapsedLabel={qcArmed ? 'Scan a unit label' : 'Scan a label'}
          status={status}
          statusAlert={cameraOff || !online}
          pending={pending}
          onDecode={onDecode}
          onErrorChange={setCameraOff}
          armRequest={armRequest}
        />
      }
    />
  );
}

export default function MobileScanIdentify() {
  return (
    <Suspense fallback={<div className="h-full bg-surface-canvas" />}>
      <MobileScanIdentifyInner />
    </Suspense>
  );
}
