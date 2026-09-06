'use client';

/**
 * A mobile station's capture window — the camera, mounted in the station sheet.
 *
 * Station-neutral: it knows how to hold a lens open and hand up decoded
 * strings. It does not know what a scan-out is, and it carries no station copy
 * — the title and the running count belong to `MobileStationShell`'s header, on
 * the page above this sheet.
 *
 * ## No STANDING text field — but a keyed fallback behind a tap
 *
 * The desk mouth carries a keyboard cell because a desk has a keyboard and a
 * wedge gun pointed at it. A phone on the dock has neither: the operator has a
 * box in one hand and the phone in the other, and an input sitting on that
 * screen is a thing to accidentally focus, a keyboard that eats half the tape,
 * and a second way to do the one thing the camera already does.
 *
 * That argument is about a STANDING field, and it was over-applied: with no
 * keyed path at all, a scuffed, wet or over-taped label could not be confirmed
 * on the dock — the operator had to carry the box to a desk. A damaged label is
 * the most common dock exception there is. So the field is here, behind a small
 * icon, closed by default, and it commits through the same `onDecode` the lens
 * does.
 *
 * ## Typing REPLACES the camera, and mounts at the top
 *
 * Two decisions that are really one. Nobody aims a lens while typing, so a
 * keyed entry that floats over a live feed is paying for a viewfinder nobody is
 * looking at — and worse, the lens keeps decoding, so a label drifting through
 * frame can commit a package while the operator is mid-word. Opening the field
 * stops the camera outright.
 *
 * And it mounts at the TOP of the sheet, not the bottom: a phone keyboard takes
 * the lower half of the screen, so a field anchored to the bottom of a
 * bottom-anchored sheet is the first thing covered by the thing you opened it
 * to use.
 *
 * ## Nothing is drawn on the feed
 *
 * The pane is the live image and nothing else — no dimming mask, no corner
 * reticle, no sweep line, no title, no counter (operator 2026-09-04). The frame
 * IS the aim box, so a drawn one only repeats it; a station's own name and count
 * belong to the page, not to the picture the operator is aiming.
 *
 * ## Three states, and they must not look alike
 *
 * `starting`, `live` and `errored`. Between mount and first frame the pane used
 * to be an unlabelled black rectangle, so a slow permission prompt was
 * indistinguishable from a dead camera — the operator waits on something that
 * is never coming, or gives up on something that was about to work.
 *
 * The lens is owned here and is the only one on the screen: two `getUserMedia`
 * streams contend, so nothing else may mount one while this is live.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { Check, Type } from '@/components/Icons';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { cn } from '@/utils/_cn';
import { MobileStationSheet } from './MobileStationSheet';
import { STATION_EYEBROW_CLASS } from './station-chrome';

/**
 * How long the same code is ignored after a read.
 *
 * Longer than the house default because this station commits something
 * irreversible: while the camera is live and the operator is still holding the
 * box they just scanned, every re-decode of that label is a bounce, not an
 * intent. Six seconds is past the point where a package has been set down and
 * the next one picked up — and a deliberate re-scan after that still lands,
 * which is the whole reason the tape collapses re-reads instead of stacking them.
 */
const DEDUP_MS = 6000;

export function MobileCaptureWindow({
  onDecode,
  /** Accessible name for the sheet. The station says what it is capturing. */
  label,
  /** What the collapsed bar says once the operator swipes the sheet away. */
  collapsedLabel = 'Scan',
  /** Short state line inside the sheet — the shift count, or what is in flight. */
  status,
  statusAlert,
  /** Reported up so the station can react to a dead lens. */
  onErrorChange,
  /** Reported up when the operator puts the sheet away, or brings it back. */
  onArmedChange,
}: {
  onDecode: (value: string) => void;
  label: string;
  collapsedLabel?: string;
  status?: string;
  statusAlert?: boolean;
  onErrorChange?: (errored: boolean) => void;
  onArmedChange?: (armed: boolean) => void;
}) {
  const scanner = useBarcodeScanner({ dedupMs: DEDUP_MS });
  const { acceptScan, lastScannedValue, resetLastScan, startScanning, stopScanning } = scanner;

  /** Open = the sheet is up and the lens is running. */
  const [open, setOpen] = useState(true);
  /** The keyed fallback, for a label the lens cannot read. */
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');

  // Held in refs so the decode effect can key strictly off the scanned VALUE.
  // Depending on the handler (or on `scanner`, which is a fresh object every
  // render) would re-fire the decode on unrelated state changes — the same scan
  // committed twice.
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const acceptRef = useRef(acceptScan);
  acceptRef.current = acceptScan;
  const resetRef = useRef(resetLastScan);
  resetRef.current = resetLastScan;

  // Armed while the sheet is up, stopped the moment it is put away. The cleanup
  // runs on collapse as well as on unmount, so the lens is never left running
  // behind a collapsed bar — an armed camera nobody is aiming still commits.
  useEffect(() => {
    // Stopped when the sheet is away AND when the operator is typing: a lens
    // still decoding behind a keyed entry can commit a label that drifts
    // through frame while they are mid-word.
    if (!open || manualOpen) {
      void stopScanning();
      return;
    }
    void startScanning();
    return () => {
      void stopScanning();
    };
  }, [open, manualOpen, startScanning, stopScanning]);

  useEffect(() => {
    if (!lastScannedValue) return;
    onDecodeRef.current(lastScannedValue.trim());
    // Accept first (arms the cooldown), then clear the value so the NEXT read of
    // this same label is a fresh state transition. Without the clear, React bails
    // out on the identical string and the effect never re-runs: an operator who
    // scans a package, sets the phone down, and scans that package again gets
    // absolutely nothing — verified 2026-09-04 against a barcode reel showing the
    // same label twice with a gap, which fired exactly one POST.
    // `keepDedup` leaves DEDUP_MS armed so the still-pointed camera does not
    // immediately re-commit the label it just accepted.
    acceptRef.current();
    resetRef.current({ keepDedup: true });
  }, [lastScannedValue]);

  const errored = scanner.scanStatus === 'error';
  // Between mount and the first frame. `isScanning` only flips once ZXing has a
  // stream, so this covers the permission prompt and the lens warm-up.
  const starting = open && !manualOpen && !errored && !scanner.isScanning;

  const onErrorChangeRef = useRef(onErrorChange);
  onErrorChangeRef.current = onErrorChange;
  useEffect(() => {
    onErrorChangeRef.current?.(errored);
  }, [errored]);

  // The header above the sheet says whether the station is live, so it has to
  // know the operator put the camera away.
  const onArmedChangeRef = useRef(onArmedChange);
  onArmedChangeRef.current = onArmedChange;
  useEffect(() => {
    onArmedChangeRef.current?.(open);
  }, [open]);

  const retry = useCallback(() => {
    void startScanning();
  }, [startScanning]);

  const submitManual = useCallback(() => {
    const value = manual.trim();
    if (!value) return;
    setManual('');
    setManualOpen(false);
    onDecodeRef.current(value);
  }, [manual]);

  // Putting the sheet away is also how you back out of typing — there is no
  // second Cancel button competing with the one confirm.
  useEffect(() => {
    if (!open && manualOpen) {
      setManualOpen(false);
      setManual('');
    }
  }, [open, manualOpen]);

  return (
    <MobileStationSheet
      label={label}
      collapsedLabel={collapsedLabel}
      status={status}
      statusAlert={statusAlert}
      open={open}
      onOpenChange={setOpen}
    >
      {/*
        Unmounted while typing, not merely covered. The effect above already
        stops the stream, but leaving the element in the tree keeps a paused
        frame of the dock behind a form and invites the next reader to assume the
        camera is still live. Replaced means replaced. ZXing binds to whichever
        element is present when `startScanning` runs, so a fresh one on reopen is
        exactly what it expects.
      */}
      {!manualOpen && (
        <video
          ref={scanner.videoRef as React.RefObject<HTMLVideoElement>}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Warm-up. Says which of the two silences this is. */}
      {starting && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center"
        >
          <span className={cn('text-role-eyebrow text-white', STATION_EYEBROW_CLASS)}>
            Starting camera
          </span>
          <p className="text-role-caption text-white/85">
            Allow camera access if your phone asks.
          </p>
        </div>
      )}

      {/*
        Keyed fallback. Mounted at the TOP so a phone keyboard cannot cover the
        field it just raised, and rendered INSTEAD of the viewfinder rather than
        over it (see the header note).
      */}
      {manualOpen ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitManual();
          }}
          className="absolute inset-0 z-20 bg-surface-card p-3"
        >
          {/*
            One control, inside the field.

            This was a 56px Send and a 56px Cancel stacked under the input —
            roughly a fifth of the sheet spent on a confirm for a field the
            operator is already typing in. That came from applying the 44px
            touch floor as a blanket rule instead of asking what the surface
            could afford. `TextField` already has a `trailing` slot for exactly
            this, and Enter submits, so the check is a fallback for a thumb, not
            the primary path.

            Cancelling is the sheet's own dismiss — swipe it down or use the
            grab bar — so there is no second button competing with the first.
          */}
          <TextField
            value={manual}
            onChange={setManual}
            label="Type the label"
            autoFocus
            mono
            inputMode="text"
            autoComplete="off"
            trailing={
              <IconButton
                type="submit"
                ariaLabel="Send typed label"
                radius="flush"
                icon={<Check className="h-4 w-4" />}
                disabled={!manual.trim()}
                className="ds-allow-control-size h-8 w-8 border-0 bg-transparent text-text-muted hover:text-text-default disabled:opacity-30"
              />
            }
          />
        </form>
      ) : (
        /*
          Top-left, on the same 28px rail as the grab bar and the status pill.

          It sat bottom-left, which put it in the phone's home-indicator zone —
          a target 12px off the bottom edge of the screen competes with the
          system gesture area and reads as hanging off the sheet. Up here it is
          a matched pair with the pill: same inset, same rail, one row of
          overlay chrome instead of controls scattered in three corners.

          28px painted, 44px hit (`before:-inset-2`): the `inline` rung of
          MOBILE_CONTROL_LADDER. It painted the full 44 while the lip was
          rounded, which forced it inboard of the curve and left it half a row
          below the pill it is supposed to line up with.
        */
        <IconButton
          onClick={() => setManualOpen(true)}
          ariaLabel="Type the label instead"
          radius="pill"
          icon={<Type className="h-3.5 w-3.5" />}
          className={cn(
            "ds-allow-control-size absolute left-2 top-1.5 z-20 h-7 w-7 border-0 before:absolute before:-inset-2 before:content-['']",
            'bg-scrim/55 text-white backdrop-blur hover:bg-scrim/70',
          )}
        />
      )}

      {errored && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-scrim/85 px-8 text-center"
        >
          <p className="text-role-caption font-medium text-rose-200">
            {scanner.error || 'Camera unavailable. Check permissions and reload.'}
          </p>
          {/* `md`, floored at 44px. `lg` is 56px in mobile mode and this is a
              recovery affordance on an error overlay, not the screen's CTA. */}
          <Button variant="secondary" size="md" className="min-h-11" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
    </MobileStationSheet>
  );
}
