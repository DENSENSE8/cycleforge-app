'use client';

/**
 * `/m/scan-out` — the dock's SHIP_CONFIRM station on a phone.
 *
 * ## What is left in this file
 *
 * Almost nothing, on purpose. The layout, the upward tape, the header, the row
 * chrome and the camera all live in `@/components/mobile/station` so the floor
 * stations that follow (`/m/pack`, `/m/unbox`, `/m/receive`) inherit them
 * instead of cloning them. What stays here is the only thing that is actually
 * about scanning packages out: the commit loop, the outcome vocabulary, the
 * shift count, and the undo.
 *
 * ## Async is the whole point
 *
 * `useScanOutStation` clears and refocuses BEFORE the POST, so the gun never
 * waits on the previous label — several confirms are in flight at once and each
 * shipment is idempotent server-side. The tape is fed from `onSettled` (every
 * settle, arrival-ordered) rather than from the single `active` carton, so a
 * response that was overtaken still lands as a row instead of vanishing.
 *
 * ## Undo lives on the tape, not under the thumb
 *
 * The mistake this station has to recover from — wrong box, wrong dock, a label
 * still on the bench — is noticed two or three packages later. A single
 * "undo the last one" handle is destroyed by the very next scan, so it is never
 * there when it is needed. Every committed row on the tape can be reversed
 * instead, by its shipment id.
 *
 * ## The commit is not silent
 *
 * The operator's eyes are on the label and the box, not on the phone. Every
 * settle fires the house scan feedback, so an irreversible ship-confirm is
 * confirmed in a channel the operator is actually using.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShippingModeScanOut } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { useNetworkOnline } from '@/hooks/useConnectionHealth';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { vibrateScan } from '@/lib/scan-feedback/play';
import {
  useScanOutStation,
  type SettledScanOut,
} from '@/components/outbound/scan-out/useScanOutStation';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { MobileStationShell } from '@/components/mobile/station/MobileStationShell';
import {
  pushStationTape,
  stationDedupeId,
  STATION_TAPE_LIMIT,
  type StationItemAction,
  type StationTapeEntry,
} from '@/components/mobile/station/station-tape';
import { STATION_EYEBROW_CLASS } from '@/components/mobile/station/station-chrome';
import { cn } from '@/utils/_cn';
import { useScanOutHistory } from './useScanOutHistory';
import {
  OUTBOX_RETRY_MS,
  dequeueScanOut,
  enqueueScanOut,
  markScanOutAttempt,
  outboxEntries,
} from './scan-out-outbox';
import {
  isScanOutCommitted,
  scanOutTapeEntry,
  SCAN_OUT_DEDUPE_KIND,
} from './mobile-scan-out-tape';

export function MobileScanOut() {
  const [tape, setTape] = useState<StationTapeEntry[]>([]);
  /**
   * Past confirms, seeded from the server so the screen opens on the operator's
   * own history rather than on empty canvas. Merged once; from then on this
   * session's scans are the truth and push onto the same list.
   */
  const { history, isError: historyFailed, retry: retryHistory } = useScanOutHistory();
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || history.length === 0) return;
    setSeeded(true);
    // Behind anything already scanned in this session, and collapsed against
    // it: a package scanned a minute ago must not also appear as history.
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
   * False once the operator swipes the sheet away to read the tape.
   *
   * Kept because the sheet reports it and a station may need it — scan-out's own
   * status line does not, since the count reads the same either way.
   */
  const [, setArmed] = useState(true);
  /**
   * The shift total, counted as commits SETTLE.
   *
   * Deliberately not `tape.filter(...).length`: the tape is capped, so a derived
   * count silently stops being true at row 41 and under-reports for the rest of
   * the shift — which is exactly when someone is reconciling it against a
   * manifest.
   */
  const [committed, setCommitted] = useState(0);

  const { playScanFeedback, hapticOn } = useScanFeedback();
  const online = useNetworkOnline();
  /** Depth of the store-and-forward queue, mirrored for the status line. */
  const [pending, setPending] = useState(0);

  const onSettled = useCallback(
    (settled: SettledScanOut) => {
      setTape((prev) => pushStationTape(prev, scanOutTapeEntry(settled)));
      if (isScanOutCommitted(settled.status)) setCommitted((n) => n + 1);
      // `ok` is the only success. A re-read is NOT: the package already left,
      // and that is a stop-work signal, so it gets the reject cue like a miss.
      // The server never saw it — hold it rather than lose it.
      if (settled.transportFailed) {
        enqueueScanOut(settled.scanned);
        setPending(outboxEntries().length);
      }
      const kind = settled.status === 'ok' ? 'success' : 'reject';
      playScanFeedback(kind);
      // Sound is preference-gated and the visual flash needs a band host this
      // page does not mount, so on a phone the PULSE is the confirmation that
      // actually arrives: the operator is holding the box, looking at the label,
      // with the phone in the other hand. `receiving.scanHaptics` defaults off,
      // which would leave an irreversible commit with no felt acknowledgement at
      // all — so this station vibrates regardless, and only fires it itself when
      // the shared hook did not already.
      if (!hapticOn) vibrateScan(kind);
    },
    [playScanFeedback, hapticOn],
  );

  const station = useScanOutStation({ onSettled });

  /**
   * Drain the outbox whenever the device is online.
   *
   * Sends directly rather than through `submitRaw`: a replay must not paint a
   * pending row or re-fire the operator's haptic minutes later for a package
   * they scanned before lunch. A settled replay lands on the tape through the
   * normal history refresh instead.
   *
   * Re-armed on a timer as well as on the `online` event, because coming back
   * online is not one moment: the browser fires `online` the instant the
   * interface is up, which is before a dock's wifi actually carries a request.
   * Without the timer a sweep that failed — or that drained one entry and then
   * hit a still-dead connection — sat there until the radio flapped again, and
   * the queue quietly stopped being a queue.
   */
  useEffect(() => {
    setPending(outboxEntries().length);
    if (!online || outboxEntries().length === 0) return;

    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const sweep = async () => {
      let stalled = false;
      for (const entry of outboxEntries()) {
        if (cancelled) return;
        try {
          const res = await fetch('/api/shipped/scan-out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // The ORIGINAL scan time, not now: a package that left at 08:12 must
            // not be recorded as leaving whenever the wifi came back.
            body: JSON.stringify({ trackingNumber: entry.tracking, createdAt: entry.scannedAt }),
          });
          if (!res.ok) throw new Error(String(res.status));
          dequeueScanOut(entry.tracking);
        } catch {
          markScanOutAttempt(entry.tracking);
          // Still down. Stop this sweep rather than hammering every entry
          // against a connection that is not there.
          stalled = true;
          break;
        }
      }
      if (cancelled) return;
      setPending(outboxEntries().length);
      if (stalled && outboxEntries().length > 0) {
        retry = setTimeout(() => void sweep(), OUTBOX_RETRY_MS);
      }
    };

    void sweep();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [online]);
  const { inFlight, submitRaw, undoShipment, undoingShipmentId } = station;

  /**
   * The reversal offered on a row.
   *
   * Only where a shipment actually left: a miss never committed anything, and a
   * `bad` row has nothing to take back. On success the row leaves the tape —
   * the package is no longer out, so a tape still listing it would be lying —
   * and the shift count comes back down with it.
   */
  /**
   * One action object per entry, built once per tape change.
   *
   * Not a per-call factory: `itemAction` runs for every visible row on every
   * render, and `MobileStationTapeItem` is memoized — returning a fresh object
   * each time would defeat that memo and re-render the whole tape on the 30s
   * clock tick. Keyed by `dedupeKey`, which is exactly what identity means here.
   */
  const actions = useMemo(() => {
    const map = new Map<string, StationItemAction>();
    for (const entry of tape) {
      const shipmentId = stationDedupeId(SCAN_OUT_DEDUPE_KIND, entry.dedupeKey);
      // Three gates, and each is a different failure it prevents:
      //  - no shipment: a miss committed nothing, so there is nothing to undo;
      //  - not `ok`: an amber re-read is somebody's EARLIER departure surfacing
      //    again, and undoing it would erase that first confirm, not this scan;
      //  - not live: a seeded history row is finished work, possibly another
      //    operator's. The server refuses those too — this keeps the affordance
      //    from being offered in the first place.
      if (shipmentId == null || !entry.dedupeKey) continue;
      if (entry.tone !== 'ok' || !entry.live) continue;
      const dedupeKey = entry.dedupeKey;
      map.set(dedupeKey, {
        label: 'Undo scan-out',
        pendingLabel: 'Undoing…',
        pending: undoingShipmentId === shipmentId,
        run: () => {
          void undoShipment(shipmentId).then((ok) => {
            if (!ok) {
              // A failed undo used to be completely silent — the button simply
              // stopped spinning and the row stayed. The operator's reasonable
              // reading was that it had worked.
              setTape((prev) =>
                prev.map((row) =>
                  row.dedupeKey === dedupeKey
                    ? { ...row, message: 'Could not undo. It may be too old, or another operator scanned it.' }
                    : row,
                ),
              );
              return;
            }
            // The package is no longer out, so a tape still listing it would be
            // lying — and the shift count comes back down with it.
            setTape((prev) => prev.filter((row) => row.dedupeKey !== dedupeKey));
            setCommitted((n) => Math.max(0, n - 1));
          });
        },
      });
    }
    return map;
  }, [tape, undoShipment, undoingShipmentId]);

  const itemAction = useCallback(
    (entry: StationTapeEntry): StationItemAction | null =>
      (entry.dedupeKey && actions.get(entry.dedupeKey)) || null,
    [actions],
  );

  const status = useMemo(() => {
    // Ranked by what the operator must act on. A queue that is not draining is
    // the most consequential thing on the screen: work is recorded but not yet
    // real, and only they know the packages are actually gone.
    if (pending > 0) return online ? `${pending} sending` : `${pending} offline`;
    if (!online) return 'Offline';
    if (cameraOff) return 'Camera off';
    if (inFlight > 0) return `${inFlight} in flight`;
    return `${committed} out`;
  }, [pending, online, cameraOff, inFlight, committed]);

  return (
    <MobileStationShell
      tape={tape}
      // What the label resolved to when it resolved to nothing: no shipment, no
      // order, no name. The row still shows the tracking underneath, which is
      // the only thing known about it.
      untitledLabel="Unfound order"
      empty={
        <div className="flex flex-col items-center gap-3 px-8 pb-6 text-center">
          <ShippingModeScanOut
            className={cn('h-8 w-8', historyFailed ? 'text-text-danger' : 'text-text-muted')}
            aria-hidden
          />
          {/* An empty shift and a failed lookup are different facts, and saying
              the first when the second happened tells an operator they have
              scanned nothing all day. */}
          {historyFailed ? (
            <>
              <p className={cn('text-role-eyebrow text-text-danger', STATION_EYEBROW_CLASS)}>
                Could not load earlier scans
              </p>
              {/* `row` rung — a recovery affordance in an empty state, not the
                  screen's CTA. 36px painted, 44px hit. */}
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
              Scan a label to send it out
            </p>
          )}
        </div>
      }
      itemAction={itemAction}
      window={
        <MobileCaptureWindow
          label="Scan out camera"
          collapsedLabel="Scan out"
          status={status}
          statusAlert={cameraOff || !online || pending > 0}
          onDecode={submitRaw}
          onErrorChange={setCameraOff}
          onArmedChange={setArmed}
        />
      }
    />
  );
}
