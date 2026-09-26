'use client';

/**
 * Picks — `/m/pick`.
 * There is no queue to read and no start button (operator 2026-09-25).
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
