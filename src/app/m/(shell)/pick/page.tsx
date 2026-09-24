'use client';

/**
 * Mobile picker queue — `/m/pick`
 * Redesigned for 2026 Mobile Design System.
 */

import RedesignedMobilePickQueue from '@/components/mobile/redesign/PickQueue';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export default function MobilePickQueuePage() {
  return (
    <ModeRegion mode="industrial" className="contents">
      <RedesignedMobilePickQueue />
    </ModeRegion>
  );
}
