'use client';

/**
 * A mobile station's capture window — the camera every scan-identification kernel on the phone runs on.
 * ## A panel with a glass bar, not a sheet (operator 2026-09-11)
 * (operator 2026-09-11, reversing the opaque band the first pass shipped).
 * sweep line, no title, no counter (operator 2026-09-04), and no second pill
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { TextField } from '@/design-system/primitives/TextField';
import { Check, Type, X } from '@/components/Icons';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import type { ScanInputSource } from '@/lib/scan/mobile-arrival-door';
import { MobileCameraPanel } from './MobileCameraPanel';

/** How long the same code is ignored after a read. */
const DEDUP_MS = 6000;

/** The header's left control: */
const LEADING_CONTROL_CLASS =
  "relative before:absolute before:-inset-2 before:content-['']";

export function MobileCaptureWindow({
  onDecode,
  /** Accessible name for the panel. The station says what it is capturing. */
  label,
  /** What the collapsed bar says once the operator presses Done. */
  collapsedLabel = 'Scan',
  /** The header's middle slot — the shift count, or the number still settling. */
  status,
  statusAlert,
  /**
   * How many scans the server has not answered yet. Drives the panel's lip
   * lane — the one moving thing on the surface, and it only moves while this
   * is above zero.
   */
  pending,
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
  /**
   * Same-code cooldown. Defaults to {@link DEDUP_MS}; a station that scans one
   * barcode several times on purpose (picking ×4 of one SKU) passes a shorter
   * window.
   */
  dedupMs = DEDUP_MS,
  /**
   * Whether the panel mounts up (lens running) or collapsed to its bar. A
   * station whose operator walks between scans mounts it collapsed, so the
   * lens never reads stray labels on the way; the bar is one tap away.
   */
  initiallyArmed = true,
  /** Seats the collapsed Scan bar in the screen's dock — see `MobileCameraPanel`. */
  collapsedFrame,
  /** The keyed fallback's field label — a station that takes a short form says so. */
  manualLabel = 'Label',
}: {
  /** `source` says whether the lens read it or the operator keyed it. */
  onDecode: (value: string, source: ScanInputSource) => void;
  label: string;
  collapsedLabel?: string;
  status?: string;
  statusAlert?: boolean;
  pending?: number;
  onErrorChange?: (errored: boolean) => void;
  onArmedChange?: (armed: boolean) => void;
  armRequest?: number;
  dedupMs?: number;
  initiallyArmed?: boolean;
  manualLabel?: string;
  collapsedFrame?: (scan: React.ReactNode) => React.ReactNode;
}) {
  // Warm: leaving the screen parks the lens (decoding stopped) for the next
  // capture window to reattach — the scan → record → scan loop never re-opens
  // the camera. The `/m` shell bounds the park (grace, hidden page, shell exit).
  const scanner = useBarcodeScanner({ dedupMs, keepWarm: true });
  const { acceptScan, lastScannedValue, resetLastScan, startScanning, stopScanning, parkScanning } = scanner;

  /** Open = the panel is up and the lens is running. */
  const [open, setOpen] = useState(initiallyArmed);
  /** The keyed fallback, for a label the lens cannot read. */
  const [manualOpen, setManualOpen] = useState(false);
  // Each external re-arm request lifts the panel. A no-op when it is already
  // up — the lens was never interrupted.
  useEffect(() => {
    if (armRequest) setOpen(true);
  }, [armRequest]);

  const [manual, setManual] = useState('');

  // Held in refs so the decode effect can key strictly off the scanned VALUE.
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const acceptRef = useRef(acceptScan);
  acceptRef.current = acceptScan;
  const resetRef = useRef(resetLastScan);
  resetRef.current = resetLastScan;

  // Armed while the panel is up, stopped the moment it is put away — Done
  // turns the lens off, so it is never left running behind a collapsed bar (an
  // armed camera nobody is aiming still commits). Typing and leaving the
  // screen only park it: decoding stops, the stream waits for the lens to come
  // back (a lens still decoding behind a keyed entry can commit a label that
  // drifts through frame while they are mid-word).
  useEffect(() => {
    if (!open) {
      void stopScanning();
      return;
    }
    if (manualOpen) return;
    void startScanning();
    return parkScanning;
  }, [open, manualOpen, startScanning, stopScanning, parkScanning]);

  useEffect(() => {
    if (!lastScannedValue) return;
    onDecodeRef.current(lastScannedValue.trim(), 'scanned');
    // Accept first (arms the cooldown), then clear the value so the NEXT read of this same label is a fresh state transition.
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
    onDecodeRef.current(value, 'typed');
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
    <div className="shrink-0">
      <MobileCameraPanel
        label={label}
        collapsedLabel={collapsedLabel}
        status={status}
        statusAlert={statusAlert}
        pending={pending}
        open={open}
        onOpenChange={setOpen}
        fitContent={manualOpen}
        stageClass={manualOpen ? 'bg-surface-card' : 'bg-stage'}
        collapsedFrame={collapsedFrame}
        /* ONE slot, both modes — and it rides the bar, not the picture. */
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
              tone="glass"
              ariaLabel="Type the label instead"
              icon={<Type className="h-3.5 w-3.5" />}
              onClick={() => setManualOpen(true)}
              className={LEADING_CONTROL_CLASS}
            />
          )
        }
      >
        {/* Unmounted while typing, not merely covered. */}
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
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 pt-9 text-center"
          >
            <span className="text-role-eyebrow text-white">
              Starting camera
            </span>
            <p className="text-role-caption text-white/85">
              Allow camera access if your phone asks.
            </p>
          </div>
        )}

        {/* Keyed fallback — a MODE, not an overlay on the lens. */}
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
            {/* Check is `size="md"` so IconButton's own flex centering owns the glyph — a bare h-8 w-8 without `size` left the mark off-axis in the… */}
            <TextField
              value={manual}
              onChange={setManual}
              label={manualLabel}
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
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-scrim/85 px-8 pt-9 text-center"
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
