'use client';

/**
 * Mobile orders queue — canonical `/m/orders`; `/m/work` is a compatibility
 * alias that mounts this same component.
 *
 * This page is the full phone queue, not a shrunk spreadsheet.
 */

import { Suspense } from 'react';
import { Inset } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { MobileToShipQueue } from '@/components/mobile/redesign/MobileToShipQueue';

/**
 * The industrial region lives here, not on a route file, so `/m/orders` (a
 * bare re-export) and `/m/work` resolve the same `*-mode-*` tokens the
 * ported ledger record reads.
 */
export default function RedesignedMobileAssignedOrders() {
  return (
    <ModeRegion mode="industrial" className={`h-full overflow-hidden ${TOKENS.colors.background}`}>
      <Suspense
        fallback={
          <Inset space="field">
            <p className="text-role-caption text-text-muted">Loading…</p>
          </Inset>
        }
      >
        <MobileToShipQueue />
      </Suspense>
    </ModeRegion>
  );
}
