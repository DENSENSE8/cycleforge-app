'use client';

/**
 * `/m/scan` — identification kernel on the phone.
 *
 * Station-agnostic: the page is not named Arrival or triage. `useScanDispatch`
 * (class × object-state) decides the Card; never-seen tracking intakes a
 * package (PO match on lookup-po). House labels identify onto their record.
 * The capture sheet is the same bottom window as scan-out.
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
  type StationItemAction,
  type StationTapeEntry,
} from '@/components/mobile/station/station-tape';
import {
  mobileArrivalPhotosThenClassifyHref,
  parseArrivalClassifyStep,
  parseArrivalReceivingId,
} from '@/lib/receiving/arrival-mobile-flow';
import { routeScan, unwrapScannedLocation, locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';
import { landScanIdentify } from '@/lib/scan/identify-land';
import { useScanDispatch } from '@/hooks/useScanDispatch';
import { cn } from '@/utils/_cn';
import { MobileArrivalClassifyFlow } from '@/components/mobile/receiving/MobileArrivalClassifyFlow';
import { ARRIVAL_DEDUPE_KIND, arrivalTapeEntry, type SettledArrival } from '@/components/mobile/receiving/arrival-station-tape';
import { useArrivalHistory } from '@/components/mobile/receiving/useArrivalHistory';
import { useArrivalStation } from '@/components/mobile/receiving/useArrivalStation';
import {
  MobileLocationBindSheet,
  type LocationBindContent,
  type LocationBindSnapshot,
} from '@/components/mobile/scan/MobileLocationBindSheet';

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
          const dispatch = await resolve(value);
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
    [resolve, router, submitRaw, playScanFeedback, hapticOn, applyLocationTape],
  );

  const actions = useMemo(() => {
    const map = new Map<string, StationItemAction>();
    for (const entry of tape) {
      const receivingId = stationDedupeId(ARRIVAL_DEDUPE_KIND, entry.dedupeKey);
      if (receivingId == null || !entry.dedupeKey) continue;
      map.set(entry.dedupeKey, {
        label: 'Photos & classify',
        pendingLabel: 'Opening…',
        pending: false,
        run: () => {
          router.push(
            mobileArrivalPhotosThenClassifyHref(receivingId, {
              title: entry.identifier ?? undefined,
            }),
          );
        },
      });
    }
    return map;
  }, [tape, router]);

  const itemAction = useCallback(
    (entry: StationTapeEntry): StationItemAction | null =>
      (entry.dedupeKey && actions.get(entry.dedupeKey)) || null,
    [actions],
  );

  const status = useMemo(() => {
    if (!online) return 'Offline — nothing is recorded';
    if (cameraOff) return 'Camera off';
    if (inFlight + dispatching > 0) return `${inFlight + dispatching} in flight`;
    return `${arrived} in`;
  }, [online, cameraOff, inFlight, dispatching, arrived]);

  if (classifyRid != null) {
    return <MobileArrivalClassifyFlow receivingId={classifyRid} step={classifyStep} />;
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
                size="sm"
                className="h-9 min-h-11"
                onClick={() => void retryHistory()}
              >
                Try again
              </Button>
            </>
          ) : (
            <p className={cn('text-role-eyebrow text-text-soft', STATION_EYEBROW_CLASS)}>
              Scan a tracking number or location code
            </p>
          )}
        </div>
      }
      itemAction={itemAction}
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
            collapsedLabel="Scan a label"
            status={status}
            statusAlert={cameraOff || !online}
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
