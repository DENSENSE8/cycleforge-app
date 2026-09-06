'use client';

/**
 * `/m/triage` — the door's ARRIVAL station on a phone.
 *
 * ## Same shell as the dock, on purpose
 *
 * The layout, the upward tape, the row chrome and the camera live in
 * `@/components/mobile/station` and are shared with `/m/scan-out`: a scan bar
 * anchored to the bottom of the screen with a live lens in it, and the running
 * ledger stacking upward above it. This station used to paint a `ScanInput` —
 * a text field with a camera TOGGLE — inside a gradient band over a card feed,
 * so the door's primary gesture (point the phone at a label) was two taps
 * behind a keyboard that has no place at a receiving door. What is left in this
 * file is only what "a box turned up" means: the contextual decision, the
 * outcome vocabulary, the shift count, and where a row goes next.
 *
 * ## Contextual, not modal
 *
 * Nothing here asks the operator what kind of scan they are making.
 * `useArrivalStation` reads whether the tracking number has ever been seen and
 * decides: never seen is an ARRIVAL and is recorded as an incoming package;
 * already seen is reported, not written again. The wrong label — a SKU, a bin,
 * one of our own unit stickers — is refused before anything is created.
 *
 * ## Where a row goes next
 *
 * Photos, then classify. A logged arrival is not finished work: the box needs
 * its label and box shots and a platform/type/priority call, which is the guided
 * flow `mobileArrivalPhotosThenClassifyHref` opens and `?rid=&step=` resumes.
 * The affordance rides ON the row, so the carton scanned four boxes ago is still
 * reachable — the same reason scan-out puts undo there rather than under the
 * thumb.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ReceivingModeArrival } from '@/components/Icons';
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
import { cn } from '@/utils/_cn';
import { MobileArrivalClassifyFlow } from './MobileArrivalClassifyFlow';
import { ARRIVAL_DEDUPE_KIND, arrivalTapeEntry, type SettledArrival } from './arrival-station-tape';
import { useArrivalHistory } from './useArrivalHistory';
import { useArrivalStation } from './useArrivalStation';

function MobileArrivalStationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classifyRid = parseArrivalReceivingId(searchParams.get('rid'));
  const classifyStep = parseArrivalClassifyStep(searchParams.get('step'));

  const [tape, setTape] = useState<StationTapeEntry[]>([]);
  /**
   * What already came through the door, from the server, merged once. From then
   * on this session's scans are the truth and push onto the same list.
   */
  const { history, isError: historyFailed, retry: retryHistory } = useArrivalHistory();
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || history.length === 0) return;
    setSeeded(true);
    // Behind anything already scanned in this session, and collapsed against it:
    // a carton scanned a minute ago must not also appear as history.
    setTape((prev) => {
      const live = new Set(prev.map((row) => row.dedupeKey).filter(Boolean));
      return [...prev, ...history.filter((row) => !row.dedupeKey || !live.has(row.dedupeKey))].slice(
        0,
        STATION_TAPE_LIMIT,
      );
    });
  }, [history, seeded]);

  const [cameraOff, setCameraOff] = useState(false);
  /**
   * The shift total, counted as arrivals SETTLE.
   *
   * Deliberately not derived from the tape: the tape is capped at 40, so a
   * derived count silently stops being true at row 41 — which is exactly when
   * someone reconciles the door against a carrier manifest.
   */
  const [arrived, setArrived] = useState(0);
  /**
   * Re-arm requests from the top bar's SCAN CTA (it reads "New" here): each
   * one lifts the capture sheet back over the keyboard if the operator had
   * swiped it away. The station's loop is continuous — there is no "last
   * result" to clear, only a lens to bring back.
   */
  const [armRequest, setArmRequest] = useState(0);
  useRegisterNewScan(() => setArmRequest((n) => n + 1));

  const { playScanFeedback, hapticOn } = useScanFeedback();
  const online = useNetworkOnline();

  const onSettled = useCallback(
    (settled: SettledArrival) => {
      setTape((prev) => pushStationTape(prev, arrivalTapeEntry(settled)));
      if (settled.status === 'arrived') setArrived((n) => n + 1);
      // Only a fresh intake is a success. A box that was already in the system
      // is a stop-work signal — it gets the reject cue, like a refused label.
      const kind = settled.status === 'arrived' ? 'success' : 'reject';
      playScanFeedback(kind);
      // The operator is holding a box and looking at a label, not at the phone.
      // `receiving.scanHaptics` defaults off, which would leave an intake with no
      // felt acknowledgement at all — so this station vibrates regardless, and
      // only fires it itself when the shared hook did not already.
      if (!hapticOn) vibrateScan(kind);
    },
    [playScanFeedback, hapticOn],
  );

  const { submitRaw, inFlight } = useArrivalStation({ onSettled });

  /**
   * One action object per entry, built once per tape change.
   *
   * Not a per-call factory: `itemAction` runs for every visible row on every
   * render and the row is memoized, so a fresh object each time would defeat
   * that memo and re-render the whole tape on the 30s clock tick.
   */
  const actions = useMemo(() => {
    const map = new Map<string, StationItemAction>();
    for (const entry of tape) {
      const receivingId = stationDedupeId(ARRIVAL_DEDUPE_KIND, entry.dedupeKey);
      // No carton, no destination: a refused label and a failed scan created
      // nothing to photograph.
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
    // Ranked by what the operator must act on. Offline is the loudest: an
    // arrival station with no connection records NOTHING, and unlike the dock
    // there is no queue to make it true later.
    if (!online) return 'Offline — nothing is recorded';
    if (cameraOff) return 'Camera off';
    if (inFlight > 0) return `${inFlight} in flight`;
    return `${arrived} in`;
  }, [online, cameraOff, inFlight, arrived]);

  if (classifyRid != null) {
    return <MobileArrivalClassifyFlow receivingId={classifyRid} step={classifyStep} />;
  }

  return (
    <MobileStationShell
      tape={tape}
      // What a carrier label resolves to when it matches no PO and no inbound:
      // a box that is now logged and has no name yet. The row still shows the
      // tracking underneath, which is the only thing known about it.
      untitledLabel="New arrival"
      empty={
        <div className="flex flex-col items-center gap-3 px-8 pb-6 text-center">
          <ReceivingModeArrival
            className={cn('h-8 w-8', historyFailed ? 'text-text-danger' : 'text-text-muted')}
            aria-hidden
          />
          {/* An empty door and a failed lookup are different facts, and saying
              the first when the second happened tells an operator nothing has
              come in all day. */}
          {historyFailed ? (
            <>
              <p className={cn('text-role-eyebrow text-text-danger', STATION_EYEBROW_CLASS)}>
                Could not load earlier arrivals
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
              Scan a carrier label to log an arrival
            </p>
          )}
        </div>
      }
      itemAction={itemAction}
      window={
        <MobileCaptureWindow
          label="Arrival camera"
          collapsedLabel="Scan an arrival"
          status={status}
          statusAlert={cameraOff || !online}
          onDecode={submitRaw}
          onErrorChange={setCameraOff}
          armRequest={armRequest}
        />
      }
    />
  );
}

export default function MobileArrivalStation() {
  return (
    <Suspense fallback={<div className="h-full bg-surface-canvas" />}>
      <MobileArrivalStationInner />
    </Suspense>
  );
}
