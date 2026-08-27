'use client';

/**
 * Flush 40px sidebar scan band — **station scan-bar SoT** (layer 1).
 *
 * Animated, staff-tinted container for a scan bar. Full-bleed flat chrome
 * (depth 2 — no card shadow). Framer glow ramps on focus/click and pulses on
 * submit; work canvas owns the elevated plane via border only.
 * Mode segments inside the bar own the solid card plane when armed.
 * Opacity-only entrance so the band is not clipped by sidebar overflow.
 *
 * Domain wrappers (`UnboxScanBand`, `TriageScanBand`, `ShippingScanBand`, …)
 * compose this shell; they must not re-declare band geometry.
 */

import { cn } from '@/utils/_cn';
import { receivingScanBandClass } from '@/components/layout/header-shell';
import { ScanBandGlowHost } from '@/components/station/scan-bar/ScanBandGlowHost';
import type { StationTheme } from '@/hooks/useStationTheme';
import type { ReactNode } from 'react';

export function ScanBandShell({
  themeColor,
  children,
}: {
  themeColor: StationTheme;
  children: ReactNode;
}) {
  return (
    // NO mount fade. This band server-renders at the top of every station
    // bench, so a framer enter animation SSRs it at `opacity: 0` and reveals it
    // only once hydration runs — which is what made LCP track hydration instead
    // of the HTML on /unbox, /triage, /search and /test. Show it or do not.
    <div
      data-station-scan-band
      // `shrink-0` on the wrapper, not just the inner band: the shell is a flex
      // child of its host column, and in a height-capped host (the floating rail
      // dock) an auto-shrink wrapper squashes the 40px band even though the band
      // itself is `shrink-0`.
      // `data-station-scan-band` is the identity hook for chrome that must share
      // this band's Y (e.g. context-panel collapse cue).
      className="shrink-0"
    >
      <ScanBandGlowHost themeColor={themeColor} className={cn(receivingScanBandClass)}>
        {children}
      </ScanBandGlowHost>
    </div>
  );
}
