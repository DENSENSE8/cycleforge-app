'use client';

/**
 * Pick board — `/m/pick/unassigned`: open picks nobody owns (and, on the All
 * tab, every open pick with its owner). Take or Pass to… from here; see
 * {@link PickBoardScreen}. Owns its top bar (under `/m/pick` in
 * `mobileRouteOwnsTopBar`), triage mode like `/m/pick`.
 */

import { PickBoardScreen } from '@/components/mobile/picker/PickBoardScreen';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export default function MobilePickBoardPage() {
  return (
    <ModeRegion mode="triage" className="contents">
      <PickBoardScreen />
    </ModeRegion>
  );
}
