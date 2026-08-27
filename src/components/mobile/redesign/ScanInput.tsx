'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { Camera } from '@/components/Icons';
import {
  ThemedStationScanBar,
  STATION_SCAN_BAR_DEFAULT_ICON_CLASS,
  STATION_SCAN_BAR_RIGHT_CELL,
} from '@/components/station/scan-bar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';


/**
 * Mobile scan surface. The input bar IS the canonical desktop
 * {@link ThemedStationScanBar} — we do NOT hand-roll a separate mobile input.
 * Default mode tucks a compact camera toggle into the bar's `rightContent`.
 * `prominentCamera` (Arrival dock) paints that right-slot glyph blue and sizes
 * it to match the leading barcode — same optical middle of the `h-10` rail.
 *
 * Self-manages its own camera + manual-input state and emits decoded values via
 * `onDecode`. Each mounted instance owns its own camera stream, so only mount /
 * un-suspend one at a time (the parent passes `cameraSuspended` to park the page
 * scanner while a sheet's scanner is live — two getUserMedia streams contend).
 */
interface ScanInputProps {
  onDecode: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Smaller viewfinder for embedding inside a bottom sheet. */
  compact?: boolean;
  /**
   * Arrival / door dock: blue camera in the right slot, optically matched to
   * the leading barcode. Default off so other stations stay compact/muted.
   */
  prominentCamera?: boolean;
  /** Unused now the camera is a compact in-bar toggle; kept for call-site compat. */
  cameraButtonLabel?: string;
  /** Force-stop the camera even if the user toggled it on (e.g. a sheet is open). */
  cameraSuspended?: boolean;
  /**
   * A lookup is in flight for the last scan. Paints the bar's own spinner
   * (`ThemedStationScanBar.isResolving`) so a fast operator can tell a scan that
   * is still resolving from one the gun never read — the difference between
   * waiting and re-scanning.
   */
  isResolving?: boolean;
}

export function ScanInput({
  onDecode,
  placeholder = 'Scan or type',
  autoFocus = false,
  compact = false,
  prominentCamera = false,
  cameraSuspended = false,
  isResolving = false,
}: ScanInputProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [input, setInput] = useState('');
  const scanner = useBarcodeScanner({ dedupMs: 2000 });
  const { user } = useAuth();

  // Keep the latest onDecode without re-running the decode effect (which is
  // keyed strictly off lastScannedValue — see UniversalScan's race note).
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const submit = useCallback((value: string) => {
    const raw = value.trim();
    if (!raw) return;
    setInput('');
    onDecodeRef.current(raw);
  }, []);

  // Start/stop strictly off (cameraActive && not suspended). Depending on the
  // whole `scanner` object would re-run on every state change and could leave
  // the camera live after Close — a stop racing an in-flight async start.
  const { startScanning, stopScanning } = scanner;
  const live = cameraActive && !cameraSuspended;
  useEffect(() => {
    if (live) void startScanning();
    else void stopScanning();
    return () => { void stopScanning(); };
  }, [live, startScanning, stopScanning]);

  // Camera decode → emit + cooldown so the same code doesn't re-fire.
  useEffect(() => {
    if (scanner.lastScannedValue) {
      onDecodeRef.current(scanner.lastScannedValue.trim());
      scanner.acceptScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanner.lastScannedValue]);

  const viewfinderHeight = compact ? '20vh' : prominentCamera ? '32vh' : '26vh';
  const boxSize = compact ? 'h-28 w-28' : 'h-40 w-40';
  const toggleCamera = useCallback(() => setCameraActive((v) => !v), []);

  return (
    <div
      className="flex flex-col gap-2"
      data-scan-camera={prominentCamera ? 'prominent' : undefined}
    >
      <ThemedStationScanBar
        value={input}
        onChange={setInput}
        onSubmit={() => submit(input)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        isResolving={isResolving}
        staffId={user?.staffId}
        // No MasterNav above on mobile — rail column, not deep masternav inset.
        leadingColumn="rail"
        rightContent={
          <HoverTooltip label={cameraActive ? 'Close camera' : 'Scan with camera'} asChild>
            <button
              type="button"
              onClick={toggleCamera}
              aria-pressed={cameraActive}
              aria-label={cameraActive ? 'Close camera scanner' : 'Open camera scanner'}
              className={cn(
                cn('ds-raw-button transition-colors', focusRing('cell', 'accent')),
                prominentCamera
                  ? STATION_SCAN_BAR_RIGHT_CELL
                  : 'flex h-6 w-6 items-center justify-center rounded-none',
                cameraActive
                  ? prominentCamera
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-surface-sunken text-text-default hover:bg-surface-sunken'
                  : prominentCamera
                    ? 'text-text-muted hover:bg-surface-sunken hover:text-text-default'
                    : 'text-text-soft hover:bg-surface-sunken hover:text-text-muted',
              )}
            >
              <Camera
                className={
                  prominentCamera
                    ? STATION_SCAN_BAR_DEFAULT_ICON_CLASS
                    : 'h-3.5 w-3.5'
                }
              />
            </button>
          </HoverTooltip>
        }
      />

      <AnimatePresence>
        {live && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: viewfinderHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative w-full overflow-hidden bg-blue-950"
          >
            <video
              ref={scanner.videoRef as React.RefObject<HTMLVideoElement>}
              className="absolute inset-0 h-full w-full object-cover opacity-70 contrast-125"
              autoPlay
              playsInline
              muted
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={`relative ${boxSize} rounded-none border-2 border-glass/40 bg-glass/5 backdrop-blur-[1px]`}>
                <motion.div
                  animate={{ top: ['5%', '95%', '5%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute left-6 right-6 h-[2px] bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,1)]"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
