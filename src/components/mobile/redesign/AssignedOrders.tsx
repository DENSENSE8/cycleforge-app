'use client';

/**
 * Mobile orders queue — `/m/work`.
 *
 * In-warehouse to-ship list with All / Assigned / Unassigned tabs. Home keeps
 * the inset preview card; this page is the full phone queue, not a shrunk
 * spreadsheet.
 */

import { Suspense } from 'react';
import { Inset } from '@/design-system/primitives';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { MobileToShipQueue } from '@/components/mobile/redesign/MobileToShipQueue';

export default function RedesignedMobileAssignedOrders() {
  return (
    <div className={`h-full overflow-hidden ${TOKENS.colors.background}`}>
      <Suspense
        fallback={
          <Inset space="field">
            <p className="text-role-caption text-text-muted">Loading…</p>
          </Inset>
        }
      >
        <MobileToShipQueue />
      </Suspense>
    </div>
  );
}
