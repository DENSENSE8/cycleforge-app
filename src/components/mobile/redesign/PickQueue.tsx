'use client';

/**
 * Mobile picker queue — `/m/pick`.
 *
 * Same phone chrome as `/m/work` (search, ship-by bands, listing, order sheet)
 * over the pending (not-yet-packed) feed.
 */

import { Suspense } from 'react';
import { Inset } from '@/design-system/primitives';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { MobileToShipQueue } from '@/components/mobile/redesign/MobileToShipQueue';

export default function RedesignedMobilePickQueue() {
  return (
    <div className={`h-full overflow-hidden ${TOKENS.colors.background}`}>
      <Suspense
        fallback={
          <Inset space="field">
            <p className="text-role-caption text-text-muted">Loading…</p>
          </Inset>
        }
      >
        <MobileToShipQueue feed="pending" />
      </Suspense>
    </div>
  );
}
