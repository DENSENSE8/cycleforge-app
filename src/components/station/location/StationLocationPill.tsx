'use client';

/**
 * @domain-job Station location pill — current bin/desk face, scan-to-place
 *   on the far-right slice, and a destination menu on the face.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse `StationTerminalDock` — that host maps a
 *   `TerminalActionVm` for the panel's ONE terminal verb (Receive · Ship) and
 *   owns the dock band; this cluster is a second, quiet pill that arms a
 *   location wedge and must sit beside that terminal without claiming it.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { MapPin, QrCode } from '@/components/Icons';
import {
  SlicedActionDock,
  type SlicedActionMenuItem,
} from '@/design-system/primitives';
import { useRegisterScanSink } from '@/lib/station-scan-sink';
import { cn } from '@/utils/_cn';

function focusEntry(el: HTMLInputElement | null) {
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  const len = el.value.length;
  el.setSelectionRange(len, len);
}

interface StationLocationPillProps {
  /** Current bin/desk face, or the empty-state invitation ("Location"). */
  face: string;
  /** Destination menu — Last entry · Move · the stations · New location. */
  menu: SlicedActionMenuItem[];
  /**
   * A wedge scan (or typed Enter) while the pill is armed. RAW input — each
   * station classifies for itself: Arrival/Unbox decode a shelf barcode,
   * Ready to Pack matches the pack-placeable desks it already holds.
   */
  onScan: (raw: string) => void;
  /** Scan-sink id — unique per mounted entity (`unbox-location:12`). */
  sinkId: string;
  disabled?: boolean;
  busy?: boolean;
  /** Tooltip on the pill. Defaults to the face. */
  tooltip?: string;
  menuLabel?: string;
  icon?: ReactNode;
  testId?: string;
}

/**
 * Composer-footer twin of Print: `SlicedActionDock` `embeddedChrome="pill"`
 * on the quiet `surface` tone (white fill, ink text). Print keeps accent.
 *
 * Split: face opens the destination menu; the far-right slice is the QR scan
 * arm. The HID cell is `endSegmentExtra` — a focus target, not a second
 * button beside the track. Wedge keystrokes go through
 * {@link useRegisterScanSink}; Enter on the focused cell submits via form.
 */
export function StationLocationPill({
  face,
  menu,
  onScan,
  sinkId,
  disabled = false,
  busy = false,
  tooltip,
  menuLabel = 'Location options',
  icon,
  testId = 'station-location-pill',
}: StationLocationPillProps) {
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState(false);
  const [scanValue, setScanValue] = useState('');

  const isDisabled = disabled || busy;

  const applyScan = useCallback(
    (raw: string) => {
      setScanValue('');
      const value = String(raw ?? '').trim();
      if (!value) return;
      onScan(value);
    },
    [onScan],
  );

  const armScan = useCallback(() => {
    if (isDisabled) return;
    setArmed(true);
    requestAnimationFrame(() => focusEntry(scanInputRef.current));
  }, [isDisabled]);

  useRegisterScanSink({
    id: sinkId,
    enabled: !isDisabled && armed,
    onScan: applyScan,
    focus: () => focusEntry(scanInputRef.current),
  });

  return (
    <div
      className="relative flex shrink-0 items-center"
      data-testid={testId}
      data-armed={armed ? 'true' : undefined}
    >
      <SlicedActionDock
        embedded
        embeddedChrome="pill"
        tone="surface"
        label={face}
        title={tooltip || face}
        icon={icon ?? <MapPin className="h-3.5 w-3.5 shrink-0" />}
        onClick={() => undefined}
        disabled={isDisabled}
        loading={busy}
        menu={menu}
        menuAnchor="primary"
        menuIcon={<QrCode className="h-3.5 w-3.5 shrink-0" />}
        menuLabel={menuLabel}
        menuTitle={menuLabel}
        endAriaLabel="Scan location QR"
        onEndClick={armScan}
        endSegmentExtra={
          <form
            className={cn(
              'absolute inset-0',
              armed ? 'z-10' : 'pointer-events-none opacity-0',
            )}
            onSubmit={(e) => {
              e.preventDefault();
              applyScan(scanValue);
            }}
          >
            <input
              ref={scanInputRef}
              type="text"
              value={scanValue}
              disabled={isDisabled}
              onChange={(e) => setScanValue(e.target.value)}
              onFocus={() => setArmed(true)}
              onBlur={() => setArmed(false)}
              placeholder=""
              aria-label={`Scan a location barcode — ${face}`}
              autoComplete="off"
              spellCheck={false}
              className="h-full w-full bg-transparent text-center text-role-micro outline-none"
              data-station-location-scan
            />
          </form>
        }
      />
    </div>
  );
}
