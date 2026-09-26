'use client';

/** Flush 40px sidebar scan band — **station scan-bar SoT** (layer 1). */

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
    // NO mount fade.
    <div
      data-station-scan-band
      // `shrink-0` on the wrapper, not just the inner band:
      className="shrink-0"
    >
      <ScanBandGlowHost themeColor={themeColor} className={cn(receivingScanBandClass)}>
        {children}
      </ScanBandGlowHost>
    </div>
  );
}
