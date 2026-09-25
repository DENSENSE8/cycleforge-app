'use client';

/**
 * Picks — `/m/pick`. Opening it IS the pick session: the system feeds one
 * line at a time (`POST /api/picking/next`); see {@link DirectedPickScreen}.
 * There is no queue to read and no start button (operator 2026-09-25).
 *
 * `/m/pick` owns its top bar (`mobileRouteOwnsTopBar`), so the shell paints
 * no header here and the screen's progress band is the only chrome. Triage
 * mode (the phone record grammar: 16px gutter, 48px hits on touch) — the
 * `mode-*` tokens the dock and page gutters read come from this region.
 */

import { DirectedPickScreen } from '@/components/mobile/picker/directed/DirectedPickScreen';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export default function MobilePickPage() {
  return (
    <ModeRegion mode="triage" className="contents">
      <DirectedPickScreen />
    </ModeRegion>
  );
}
