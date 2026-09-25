'use client';

/**
 * `/m/scan` — identification kernel on the phone.
 *
 * Station-agnostic: the page is not named Arrival or triage. `useScanDispatch`
 * (class × object-state) decides the Card; never-seen tracking intakes a
 * package (PO match on lookup-po). House labels identify onto their record.
 * The capture sheet is the same bottom window as scan-out.
 *
 * `?work=qc` arms the QC session on this same kernel (there is no second QC
 * scan door): a unit label opens its checklist, a line label its unit pick,
 * and any other label lands exactly as it does unarmed.
 */

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
import { routeScan, unwrapScannedLocation, locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { landScanIdentify } from '@/lib/scan/identify-land';
import { QC_SCAN_SESSION } from '@/lib/scan/dispatch-table';
import { useScanDispatch } from '@/hooks/useScanDispatch';
import { cn } from '@/utils/_cn';
import { recordMobileSessionEntry } from '@/lib/mobile/mobile-session-feed';
import { MobileArrivalClassifyFlow } from '@/components/mobile/receiving/MobileArrivalClassifyFlow';
import { ARRIVAL_DEDUPE_KIND, arrivalTapeEntry, type SettledArrival } from '@/components/mobile/receiving/arrival-station-tape';
import { useArrivalHistory } from '@/components/mobile/receiving/useArrivalHistory';
import { useArrivalStation } from '@/components/mobile/receiving/useArrivalStation';
import { MobileLocationBindSheet } from '@/components/mobile/scan/MobileLocationBindSheet';
import type {
  LocationBindContent,
  LocationBindSnapshot,
} from '@/components/mobile/scan/location-bind-types';

function locationFace(code: string): string {
  const segs = parseLocationCodeFlat(code);
  return segs ? locationCode(segs) : code;
}

async function loadLocationBind(
  raw: string,
  seq: number,
): Promise<{ entry: StationTapeEntry; contents: LocationBindContent[]; code: string }> {
  const code = unwrapScannedLocation(raw);
  const face = locationFace(code);
  let contents: LocationBindContent[] = [];

  try {
    const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as {
        contents?: Array<{
          sku?: string;
          qty?: number;
          productTitle?: string | null;
        }>;
      };
      contents = (json.contents ?? [])
        .filter((c) => Number(c.qty) > 0 && c.sku)
        .map((c) => ({
          sku: String(c.sku),
          qty: Number(c.qty) || 0,
          productTitle: c.productTitle ?? null,
          imageUrl: null,
        }));
    }
  } catch {
    /* offline / 5xx → honest empty face */
  }

  const paired = contents.length > 0;
  const first = contents[0];
  const entry: StationTapeEntry = {
    id: `location-${seq}`,
    tone: paired ? 'ok' : 'warn',
    verb: paired ? 'Paired' : 'Empty',
    title: first
      ? first.productTitle?.trim() || first.sku
      : paired
        ? 'Paired location'
        : 'Empty location',
    identifier: face,
    recordId: null,
    conditionGrade: null,
    imageUrl: first?.imageUrl ?? null,
    actor: null,
    actorId: null,
    message: paired
      ? contents.length === 1
        ? `SKU ${first!.sku} · qty ${first!.qty}`
        : `${contents.length} SKUs in this location`
      : 'No SKU paired to this location yet.',
    at: new Date().toISOString(),
    dedupeKey: `location:${code.toUpperCase()}`,
    live: true,
  };
  return { entry, contents, code };
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
  const [bindRaw, setBindRaw] = useState<string | null>(null);
  const [bindContents, setBindContents] = useState<LocationBindContent[]>([]);

  const applyLocationTape = useCallback((entry: StationTapeEntry) => {
    setTape((prev) => pushStationTape(prev, entry));
    recordMobileSessionEntry({
      id: entry.id,
      job: 'display',
      title: entry.title,
      identifier: entry.identifier,
      entityId: null,
      state: entry.tone === 'ok' ? 'done' : entry.tone === 'warn' ? 'blocked' : 'error',
      href: '/m/scan',
      at: entry.at,
      dedupeKey: entry.dedupeKey ? `display:${entry.dedupeKey}` : null,
    });
  }, []);

  const onBindChanged = useCallback(
    (snap: LocationBindSnapshot) => {
      setBindContents(snap.contents);
      const paired = snap.contents.length > 0;
      const first = snap.contents[0];
      applyLocationTape({
        id: `location-live-${snap.code}`,
        tone: paired ? 'ok' : 'warn',
        verb: paired ? 'Paired' : 'Empty',
        title: first
          ? first.productTitle?.trim() || first.sku
          : 'Empty location',
        identifier: snap.face,
        recordId: null,
        conditionGrade: null,
        imageUrl: first?.imageUrl ?? null,
        actor: null,
        actorId: null,
        message: paired
          ? `SKU ${first!.sku} · qty ${first!.qty}`
          : 'No SKU paired to this location yet.',
        at: new Date().toISOString(),
        dedupeKey: `location:${snap.code.toUpperCase()}`,
        live: true,
      });
    },
    [applyLocationTape],
  );

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
          const land = landScanIdentify(dispatch, route);
          if (land.kind === 'identify') {
            router.push(land.href);
            return;
          }
          if (land.kind === 'intake') {
            submitRaw(value);
            return;
          }
          if (route?.type === 'bin' || route?.type === 'bin-paired-order') {
            const seq = ++locationSeqRef.current;
            const { entry, contents, code } = await loadLocationBind(value, seq);
            applyLocationTape(entry);
            setBindRaw(code);
            setBindContents(contents);
            const kind = entry.tone === 'ok' ? 'success' : 'reject';
            playScanFeedback(kind);
            if (!hapticOn) vibrateScan(kind);
          }
        } finally {
          setDispatching((n) => Math.max(0, n - 1));
        }
      })();
    },
    [resolve, qcArmed, router, searchParams, submitRaw, playScanFeedback, hapticOn, applyLocationTape],
  );

  // The kernel owns hardware scans on this screen. A ring / HID wedge read is
  // claimed from the app-wide listener (`useGlobalWedgeScanner`), which would
  // otherwise navigate straight to the label's UNARMED redirect — so with QC
  // armed a wedge-scanned unit or carton skipped its checklist / line pick.
  // Claimed, it resolves through the same dispatch as the camera.
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
   * A carton row opens the carton itself (operator 2026-09-24: the primary
   * record of the job is a full screen with an X back to the job, never a
   * sheet or a verb strip). The triage decisions — photos, classify
   * (Platform → Type → Priority), unbox — live on the carton hub `/m/r/[id]`:
   * Take photo in its dock, Classify as its door `/m/r/[id]/classify`.
   */
  const opens = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const entry of tape) {
      const receivingId = stationDedupeId(ARRIVAL_DEDUPE_KIND, entry.dedupeKey);
      if (receivingId == null || !entry.dedupeKey) continue;
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

  /**
   * The middle slot, as a COUNT.
   *
   * It used to read `2 in flight` / `Offline — nothing is recorded`: prose in
   * an 11px band, read by someone whose eyes are on the box, re-flowing its
   * neighbours every time the number changed. The lane now carries "is
   * anything pending" in the channel peripheral vision actually has (a moving
   * edge), so this line only has to carry the NUMBER — which is also what
   * keeps the count reachable by AT, since motion may never be a sole channel.
   *
   * `Offline` stays a word because it is not a quantity, and it is the one
   * state where the operator must stop: the lane goes static danger under it.
   */
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
        bindRaw ? (
          <MobileLocationBindSheet
            rawCode={bindRaw}
            initialContents={bindContents}
            onClose={() => {
              setBindRaw(null);
              setBindContents([]);
              setArmRequest((n) => n + 1);
            }}
            onChanged={onBindChanged}
          />
        ) : (
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
        )
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
