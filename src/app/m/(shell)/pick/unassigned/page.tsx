'use client';

/** Pick board — `/m/pick/unassigned`: */

import { PickBoardScreen } from '@/components/mobile/picker/PickBoardScreen';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export default function MobilePickBoardPage() {
  return (
    <ModeRegion mode="triage" className="contents">
      <PickBoardScreen />
    </ModeRegion>
  );
}
