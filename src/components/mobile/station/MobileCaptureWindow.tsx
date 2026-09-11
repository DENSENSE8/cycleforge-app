'use client';

/**
 * A mobile station's capture window — the camera every scan-identification
 * kernel on the phone runs on.
 *
 * This is the SoT lens. `/m/scan` mounts it, and every floor station cloned
 * from that shape mounts it too: one `getUserMedia` owner, one dedup window,
 * one decode-to-`onDecode` contract, one set of controls. A station that wants
 * a camera does NOT open its own — it mounts this and supplies copy.
 *
 * Station-neutral: it knows how to hold a lens open and hand up decoded
 * strings. It does not know what a scan-out is, and it carries no station copy
 * — the title and the running count belong to `MobileStationShell`'s header, on
 * the page above it.
 *
 * ## A panel with a header, not a sheet (operator 2026-09-11)
 *
 * The chrome lives in {@link MobileCameraPanel}: a fixed, square-lipped bottom
 * panel with ONE short control row above the picture, three fixed slots —
 *
 *   [ type-a-label ]      what is happening now      [ Done ]
 *
 * — replacing a draggable sheet whose dismiss was a gesture and whose controls
 * were painted over the live feed in three different corners. What this file
 * now supplies to that panel is the LEADING slot (below) and a status string;
 * it no longer positions anything absolutely over the image.
 *
 * ## No STANDING text field — but a keyed fallback in the leading slot
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
 * the most common dock exception there is. So the field is here, behind the
 * header's left control, closed by default, and it commits through the same
 * `onDecode` the lens does.
 *
 * ## Typing REPLACES the camera, and docks flush above the keyboard
 *
 * Two decisions that are really one. Nobody aims a lens while typing, so a
 * keyed entry that floats over a live feed is paying for a viewfinder nobody is
 * looking at — and worse, the lens keeps decoding, so a label drifting through
 * frame can commit a package while the operator is mid-word. Opening the field
 * stops the camera outright.
 *
 * The typed bar collapses the panel's STAGE to content height so its lip stays
 * flush under the focus tape row — never a tall empty stage between the last
 * entry and the field. `useKeyboard` lifts that short bar with `marginBottom`
 * so it still rides the keys. The header does not move: same three slots, so
 * the status line and Done stay exactly where they were and the left control
 * swaps its glyph for cancel.
 *
 * ## Nothing is drawn on the feed
 *
 * The stage is the live image and nothing else — no dimming mask, no corner
 * reticle, no sweep line, no title, no counter (operator 2026-09-04), and since
 * 2026-09-11 no control chrome either: the panel's header owns all three. The
 * frame IS the aim box, so a drawn one only repeats it. The only things that
 * ever cover the picture are the two states that REPLACE it — warm-up and a
 * dead lens.
 *
 * ## Three states, and they must not look alike
 *
 * `starting`, `live` and `errored`. Between mount and first frame the stage used
 * to be an unlabelled black rectangle, so a slow permission prompt was
 * indistinguishable from a dead camera — the operator waits on something that
 * is never coming, or gives up on something that was about to work.
 *
 * The lens is owned here and is the only one on the screen: two `getUserMedia`
 * streams contend, so nothing else may mount one while this is live.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { TextField } from '@/design-system/primitives/TextField';
import { Check, Type, X } from '@/components/Icons';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useKeyboard } from '@/hooks/useKeyboard';
import { cn } from '@/utils/_cn';
import { MobileCameraPanel } from './MobileCameraPanel';
import { STATION_EYEBROW_CLASS } from './station-chrome';

/**
 * How long the same code is ignored after a read.
 *
 * A dock operator points the phone at a label and holds it there while the
 * commit lands, so a short window re-commits the same package several times
 * from one aim. Six seconds is long enough to cover that hold and short enough
 * that a genuine second scan of the same tracking — the operator re-checking a
 * box — still reads.
 */
const DEDUP_MS = 6000;

/**
 * The header's left control: 28px painted, 44px hit.
 *
 * The `inline` rung of MOBILE_CONTROL_LADDER — paint small, hit big. The extra
 * 8px on every side rides a pseudo-element, so the control row stays 36px tall
 * while the thumb still gets its full target.
 */
const LEADING_CONTROL_CLASS =
  "relative before:absolute before:-inset-2 before:content-['']";

export function MobileCaptureWindow({
  onDecode,
  /** Accessible name for the panel. The station says what it is capturing. */
  label,
  /** What the collapsed bar says once the operator presses Done. */
  collapsedLabel = 'Scan',
  /**
   * The header's middle slot — the shift count, or what is in flight. Painted
   * whether or not the operator is typing: a commit that is still settling is
   * exactly the thing they need to see while they key the next label.
   */
  status,
  statusAlert,
  /** Reported up so the station can react to a dead lens. */
  onErrorChange,
  /** Reported up when the operator puts the camera away, or brings it back. */
  onArmedChange,
  /**
   * Bring the panel back up. A counter, not a boolean: each increment is one
   * re-arm request from outside (the top bar's CTA), and the effect must fire
   * per request — a boolean could not ask twice.
   */
  armRequest,
}: {
  onDecode: (value: string) => void;
  label: string;
  collapsedLabel?: string;
  status?: string;
  statusAlert?: boolean;
  onErrorChange?: (errored: boolean) => void;
  onArmedChange?: (armed: boolean) => void;
  armRequest?: number;
}) {
  const scanner = useBarcodeScanner({ dedupMs: DEDUP_MS });
  const { acceptScan, lastScannedValue, resetLastScan, startScanning, stopScanning } = scanner;

  /** Open = the panel is up and the lens is running. */
  const [open, setOpen] = useState(true);
  /** The keyed fallback, for a label the lens cannot read. */
  const [manualOpen, setManualOpen] = useState(false);
  // Threshold under the default 150: IP-address / remote-devtools phones often
  // report a smaller inset while the OS keyboard is already covering the panel.
  const { keyboardHeight } = useKeyboard({ threshold: 80 });

  // Each external re-arm request lifts the panel. A no-op when it is already
  // up — the lens was never interrupted.
  useEffect(() => {
    if (armRequest) setOpen(true);
  }, [armRequest]);

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

  // Armed while the panel is up, stopped the moment it is put away. The cleanup
  // runs on Done as well as on unmount, so the lens is never left running
  // behind a collapsed bar — an armed camera nobody is aiming still commits.
  useEffect(() => {
    // Stopped when the camera is away AND when the operator is typing: a lens
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

  // The header above the panel says whether the station is live, so it has to
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

  // Back to the lens without putting the camera away — typing is a mode swap,
  // not a second surface welded onto the camera.
  const dismissManual = useCallback(() => {
    setManualOpen(false);
    setManual('');
  }, []);

  // Done also clears typing.
  useEffect(() => {
    if (!open && manualOpen) {
      setManualOpen(false);
      setManual('');
    }
  }, [open, manualOpen]);

  // Escape leaves typing first; a second Escape (the panel's listener) then
  // presses Done.
  useEffect(() => {
    if (!manualOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      dismissManual();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [manualOpen, dismissManual]);

  return (
    <div
      className="shrink-0"
      style={manualOpen ? { marginBottom: keyboardHeight } : undefined}
    >
      <MobileCameraPanel
        label={label}
        collapsedLabel={collapsedLabel}
        status={status}
        statusAlert={statusAlert}
        open={open}
        onOpenChange={setOpen}
        fitContent={manualOpen}
        stageClass={manualOpen ? 'bg-surface-card' : 'bg-stage'}
        /*
          ONE slot, both modes. Off the feed and into the header row, which is
          where it should always have been: it sat over the live image at
          `absolute left-2 top-1.5`, competing with the picture for the same
          pixels and moving whenever the lip's radius changed.
        */
        leading={
          manualOpen ? (
            <IconButton
              type="button"
              size="sm"
              ariaLabel="Cancel typing"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={dismissManual}
              className={LEADING_CONTROL_CLASS}
            />
          ) : (
            <IconButton
              size="sm"
              ariaLabel="Type the label instead"
              icon={<Type className="h-3.5 w-3.5" />}
              onClick={() => setManualOpen(true)}
              className={LEADING_CONTROL_CLASS}
            />
          )
        }
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
          Keyed fallback — a MODE, not an overlay on the lens.

          The stage collapses to this bar (`fitContent`) so the tape lip meets
          the field with no empty stage between them. The cancel lives in the
          header's left slot; Enter or the check commits. Parent `marginBottom`
          rides the OS keyboard without parking the bar mid-screen.
        */}
        {manualOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitManual();
            }}
            className="flex items-center gap-2 px-3 py-3"
            style={{
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
            }}
          >
            {/*
              Check is `size="md"` so IconButton's own flex centering owns the
              glyph — a bare h-8 w-8 without `size` left the mark off-axis in
              the trailing slot. Enter still submits; the check is the thumb
              fallback.
            */}
            <TextField
              value={manual}
              onChange={setManual}
              label="Label"
              autoFocus
              mono
              inputMode="text"
              autoComplete="off"
              className="min-w-0 flex-1"
              trailing={
                <IconButton
                  type="submit"
                  size="md"
                  radius="flush"
                  ariaLabel="Send typed label"
                  icon={<Check className="h-4 w-4" />}
                  disabled={!manual.trim()}
                  className="border-0 bg-transparent text-text-muted hover:text-text-default disabled:opacity-30"
                />
              }
            />
          </form>
        )}

        {errored && !manualOpen && (
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
      </MobileCameraPanel>
    </div>
  );
}
